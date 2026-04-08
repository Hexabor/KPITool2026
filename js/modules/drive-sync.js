/**
 * Google Drive Sync module
 * Handles backup/restore of the IndexedDB database to Google Drive.
 * Requires Google API client library and OAuth2 configuration.
 */
const DriveSync = (() => {
    // Google API config - to be set by user in settings
    const CONFIG = {
        CLIENT_ID: '', // Set via settings
        API_KEY: '',   // Set via settings
        SCOPES: 'https://www.googleapis.com/auth/drive.file',
        BACKUP_FOLDER: 'KPITool2026_Backups',
        BACKUP_FILENAME: 'kpitool_backup.json'
    };

    let isAuthenticated = false;
    let tokenClient = null;

    /** Initialize the Google API client */
    async function init(clientId, apiKey) {
        if (clientId) CONFIG.CLIENT_ID = clientId;
        if (apiKey) CONFIG.API_KEY = apiKey;

        if (!CONFIG.CLIENT_ID) {
            console.log('DriveSync: No client ID configured, skipping init');
            return false;
        }

        return new Promise((resolve) => {
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: CONFIG.API_KEY,
                        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                    });
                    resolve(true);
                } catch (e) {
                    console.error('DriveSync init error:', e);
                    resolve(false);
                }
            });
        });
    }

    /** Authenticate with Google */
    async function authenticate() {
        if (!CONFIG.CLIENT_ID) {
            throw new Error('Google Drive Client ID not configured. Go to Settings.');
        }

        return new Promise((resolve, reject) => {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                callback: (response) => {
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    isAuthenticated = true;
                    resolve(true);
                }
            });
            tokenClient.requestAccessToken();
        });
    }

    /** Check if authenticated */
    function isConnected() {
        return isAuthenticated;
    }

    /** Find or create the backup folder */
    async function getBackupFolderId() {
        // Search for existing folder
        const response = await gapi.client.drive.files.list({
            q: `name='${CONFIG.BACKUP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)'
        });

        if (response.result.files.length > 0) {
            return response.result.files[0].id;
        }

        // Create folder
        const folder = await gapi.client.drive.files.create({
            resource: {
                name: CONFIG.BACKUP_FOLDER,
                mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
        });

        return folder.result.id;
    }

    /** Save backup to Drive */
    async function backup(data) {
        if (!isAuthenticated) {
            throw new Error('Not authenticated with Google Drive');
        }

        const folderId = await getBackupFolderId();
        const content = JSON.stringify(data);
        const blob = new Blob([content], { type: 'application/json' });

        // Check if backup file already exists
        const existing = await gapi.client.drive.files.list({
            q: `name='${CONFIG.BACKUP_FILENAME}' and '${folderId}' in parents and trashed=false`,
            fields: 'files(id)'
        });

        const metadata = {
            name: CONFIG.BACKUP_FILENAME,
            mimeType: 'application/json'
        };

        if (existing.result.files.length > 0) {
            // Update existing file
            const fileId = existing.result.files[0].id;
            return uploadFile(fileId, blob, 'PATCH');
        } else {
            // Create new file
            metadata.parents = [folderId];
            return uploadFile(null, blob, 'POST', metadata);
        }
    }

    /** Upload file using multipart upload */
    async function uploadFile(fileId, blob, method, metadata) {
        const form = new FormData();

        if (metadata) {
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        }
        form.append('file', blob);

        const url = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const token = gapi.client.getToken().access_token;
        const response = await fetch(url, {
            method: method || 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        return response.json();
    }

    /** Restore from Drive backup */
    async function restore() {
        if (!isAuthenticated) {
            throw new Error('Not authenticated with Google Drive');
        }

        const folderId = await getBackupFolderId();

        const response = await gapi.client.drive.files.list({
            q: `name='${CONFIG.BACKUP_FILENAME}' and '${folderId}' in parents and trashed=false`,
            fields: 'files(id, modifiedTime)'
        });

        if (response.result.files.length === 0) {
            throw new Error('No backup found on Google Drive');
        }

        const fileId = response.result.files[0].id;
        const fileResponse = await gapi.client.drive.files.get({
            fileId,
            alt: 'media'
        });

        return JSON.parse(fileResponse.body);
    }

    /** Get backup info from Drive */
    async function getBackupInfo() {
        if (!isAuthenticated) return null;

        try {
            const folderId = await getBackupFolderId();
            const response = await gapi.client.drive.files.list({
                q: `name='${CONFIG.BACKUP_FILENAME}' and '${folderId}' in parents and trashed=false`,
                fields: 'files(id, modifiedTime, size)'
            });

            if (response.result.files.length > 0) {
                const file = response.result.files[0];
                return {
                    lastModified: file.modifiedTime,
                    size: file.size
                };
            }
        } catch (e) {
            console.error('Error getting backup info:', e);
        }

        return null;
    }

    return {
        init,
        authenticate,
        isConnected,
        backup,
        restore,
        getBackupInfo
    };
})();
