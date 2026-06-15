const { readConfig } = require('../utils/fileUtils');

class CloudflareManager {
    constructor(userId) {
        this.userId = userId;
        this.initializeConfig();
    }

    initializeConfig() {
        const config = readConfig();
        const credentials = config[this.userId];
        if (!credentials) {
            throw new Error('Kredensial Cloudflare belum dikonfigurasi. Hubungkan akun Anda terlebih dahulu.');
        }

        this.cfEmail = credentials.email.trim();
        this.cfApiKey = credentials.global_api_key.trim();
        this.cfAccountId = credentials.accountId.trim();
        this.baseUrl = 'https://api.cloudflare.com/client/v4';
        
        this.headers = {
            'X-Auth-Email': this.cfEmail,
            'X-Auth-Key': this.cfApiKey,
            'Content-Type': 'application/json',
        };
    }

    async getZones() {
        try {
            const response = await fetch(`${this.baseUrl}/zones?per_page=50`, {
                method: 'GET',
                headers: this.headers,
            });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.errors?.[0]?.message || 'Gagal mengambil daftar zone.');
            }
            return data.result.map(zone => ({
                id: zone.id,
                name: zone.name
            }));
        } catch (error) {
            throw new Error(`Gagal mengambil zone: ${error.message}`);
        }
    }

    async getZoneId(domain) {
        const cleanDomain = domain.replace(/^\*\./, '');
        
        try {
            const zones = await this.getZones();
            // Sort zones by length descending to match the most specific zone first
            zones.sort((a, b) => b.name.length - a.name.length);
            
            const matchedZone = zones.find(zone => cleanDomain === zone.name || cleanDomain.endsWith('.' + zone.name));
            if (!matchedZone) {
                throw new Error(`Domain/zone untuk "${domain}" tidak ditemukan di akun Cloudflare Anda.`);
            }
            return matchedZone.id;
        } catch (error) {
            throw new Error(`Gagal mendapatkan Zone ID: ${error.message}`);
        }
    }

    async uploadWorker(workerName, codeText) {
        const form = new globalThis.FormData();
        const metadata = new globalThis.Blob([JSON.stringify({
            main_module: "worker.js"
        })], { type: "application/json" });
        form.append("metadata", metadata);
        
        const script = new globalThis.Blob([codeText], { type: "application/javascript+module" });
        form.append("worker.js", script, "worker.js");
        
        const uploadUrl = `${this.baseUrl}/accounts/${this.cfAccountId}/workers/scripts/${workerName}`;
        
        const response = await globalThis.fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'X-Auth-Email': this.cfEmail,
                'X-Auth-Key': this.cfApiKey
            },
            body: form
        });
        
        const resJson = await response.json();
        if (!response.ok || !resJson.success) {
            throw new Error(resJson.errors?.[0]?.message || 'Gagal mengupload worker.');
        }
        return true;
    }

    async bindCustomDomain(workerName, hostname) {
        const zoneId = await this.getZoneId(hostname);
        
        const response = await fetch(`${this.baseUrl}/accounts/${this.cfAccountId}/workers/domains`, {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify({
                hostname: hostname,
                service: workerName,
                environment: 'production',
                zone_id: zoneId,
                override_existing_dns_record: true,
            }),
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.errors?.[0]?.message || 'Gagal menghubungkan domain.');
        }
        return true;
    }

    async addCustomHostname(hostname, saasZoneName) {
        // Use saasZoneName to get the zone ID of the SaaS zone, fallback to hostname
        const zoneId = await this.getZoneId(saasZoneName || hostname);
        
        const isWildcard = hostname.startsWith('*.');
        const cleanHost = hostname.replace(/^\*\./, '');
        const sslMethod = isWildcard ? 'txt' : 'http';
        
        const sslPayload = {
            method: sslMethod,
            type: 'dv'
        };
        
        if (isWildcard) {
            sslPayload.wildcard = true;
        }
        
        const response = await fetch(`${this.baseUrl}/zones/${zoneId}/custom_hostnames`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                hostname: cleanHost,
                ssl: sslPayload
            }),
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.errors?.[0]?.message || 'Gagal menambahkan custom hostname.');
        }
        return data.result;
    }

    async getCustomHostnameStatus(hostname, saasZoneName) {
        const zoneId = await this.getZoneId(saasZoneName || hostname);
        const cleanHost = hostname.replace(/^\*\./, '');
        const response = await fetch(`${this.baseUrl}/zones/${zoneId}/custom_hostnames?hostname=${cleanHost}`, {
            method: 'GET',
            headers: this.headers,
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.errors?.[0]?.message || 'Gagal memeriksa status custom hostname.');
        }
        
        if (!data.result || data.result.length === 0) {
            throw new Error(`Custom hostname "${cleanHost}" tidak ditemukan di Cloudflare.`);
        }
        return data.result[0];
    }

    async getFallbackOrigin(zoneId) {
        const response = await fetch(`${this.baseUrl}/zones/${zoneId}/custom_hostnames/fallback_origin`, {
            method: 'GET',
            headers: this.headers,
        });

        const data = await response.json();
        if (!data.success || !data.result) {
            throw new Error(data.errors?.[0]?.message || 'Fallback Origin belum diset di Cloudflare.');
        }
        return data.result.origin;
    }

    async addDnsRecord(zoneId, type, name, content, proxied = false) {
        const response = await fetch(`${this.baseUrl}/zones/${zoneId}/dns_records`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                type: type,
                name: name,
                content: content,
                ttl: 1,
                proxied: proxied,
                comment: 'Automated validation record by Bot Manager',
            }),
        });

        const data = await response.json();
        if (!data.success) {
            if (data.errors?.[0]?.code === 81057 || data.errors?.[0]?.message?.includes('already exists')) {
                return true;
            }
            throw new Error(data.errors?.[0]?.message || `Gagal membuat DNS ${type} record.`);
        }
        return true;
    }

    async addARecord(hostname, ipAddress) {
        const zoneId = await this.getZoneId(hostname);
        
        const response = await fetch(`${this.baseUrl}/zones/${zoneId}/dns_records`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                type: 'A',
                name: hostname,
                content: ipAddress,
                ttl: 1, // Automatic
                proxied: false, // DNS Only (grey cloud)
                comment: 'Pointing A record by Bot Manager',
            }),
        });

        const data = await response.json();
        if (!data.success) {
            if (data.errors?.[0]?.code === 81057 || data.errors?.[0]?.message?.includes('already exists')) {
                throw new Error('Record DNS A tersebut sudah terdaftar di Cloudflare.');
            }
            throw new Error(data.errors?.[0]?.message || 'Gagal membuat DNS A record.');
        }
        return true;
    }
}

module.exports = CloudflareManager;
