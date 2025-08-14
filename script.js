// --- Configuration ---
const CLIENT_ID = "917652135636-fig5jstj49aj8rmbdjj0als4126ehmcm.apps.googleusercontent.com";
const API_KEY = "AIzaSyBB-dcmDtOcuMlmQ4BGje2BjrdagI1EG6s";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive';
const CONCURRENT_REQUESTS = 5;

// --- DOM Elements ---
const ui = {
    body: document.body,
    themeSwitcher: document.getElementById('theme_switcher'),
    authorizeButton: document.getElementById('authorize_button'),
    signoutButton: document.getElementById('signout_button'),
    copyButton: document.getElementById('copy_button'),
    messageContainer: document.getElementById('message-container'),
    authContainer: document.getElementById('auth-container'),
    uploaderContainer: document.getElementById('uploader-container'),
    initialLoader: document.getElementById('initial-loader'),
    initialMessage: document.getElementById('initial-message'),
    urlInput: document.getElementById('urlInput'),
    destFolderIdInput: document.getElementById('destFolderId'),
    speedBooster: document.getElementById('speedBooster')
};

// --- Global State ---
let gapiInited = false;
let gisInited = false;
let tokenClient;
let isCopyCancelled = false;
let initTimedOut = false;
const themes = ['theme-dark', 'theme-stars', 'theme-rose', 'theme-aqua'];
let currentThemeIndex = 0;

// --- Initialization ---
setTimeout(() => {
    if (!gapiInited || !gisInited) {
        initTimedOut = true;
        handleError("Initialization timed out. Please check your internet connection, disable any ad blockers, and refresh the page.");
    }
}, 10000);

function gapiLoaded() { gapi.load('client', initializeGapiClient); }
async function initializeGapiClient() {
    if (initTimedOut) return;
    try {
        await gapi.client.init({ apiKey: API_KEY, discoveryDocs: DISCOVERY_DOCS });
        gapiInited = true;
        checkReadyState();
    } catch (error) { handleError('GAPI client failed to initialize. Check API Key.', error); }
}
function gisLoaded() {
    if (initTimedOut) return;
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID, scope: SCOPES, callback: handleAuthResponse,
        });
        gisInited = true;
        checkReadyState();
    } catch (error) { handleError('Google Identity Services failed to initialize. Check Client ID.', error); }
}
function checkReadyState() {
    if (gapiInited && gisInited) {
        ui.initialLoader.style.display = 'none';
        ui.initialMessage.style.display = 'none';
        ui.authorizeButton.style.display = 'flex';
        showMessage('Ready to authorize.', 'gray');
    }
}

// --- Event Listeners ---
ui.themeSwitcher.onclick = () => {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    ui.body.className = `${themes[currentThemeIndex]} flex items-center justify-center`;
};
ui.authorizeButton.onclick = () => {
    if (tokenClient) tokenClient.requestAccessToken();
    else handleError('Authorization client is not ready.');
};
ui.signoutButton.onclick = () => {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(null);
            ui.uploaderContainer.style.display = 'none';
            ui.authContainer.style.display = 'block';
            showMessage('You have been signed out.', 'gray');
        });
    }
};
ui.copyButton.onclick = async () => {
    const url = ui.urlInput.value;
    const destFolderId = ui.destFolderIdInput.value || 'root';
    if (!url) { showMessage('Please enter a source URL.', 'red'); return; }
    const sourceId = getItemIdFromUrl(url);
    if (!sourceId) { showMessage('Invalid Google Drive URL.', 'red'); return; }

    isCopyCancelled = false;
    ui.copyButton.disabled = true;
    
    try {
        const sourceMeta = await gapi.client.drive.files.get({ fileId: sourceId, fields: 'id, name, mimeType' });
        if (sourceMeta.result.mimeType === 'application/vnd.google-apps.folder') {
            await copyFolder(sourceMeta.result, destFolderId);
        } else {
            await copyFile(sourceMeta.result, destFolderId);
        }
    } catch (error) {
        handleError('Failed to copy. Please check the link and your permissions.', error);
    } finally {
        ui.copyButton.disabled = false;
    }
};
ui.urlInput.addEventListener('input', () => {
    const url = ui.urlInput.value;
    const defaultColor = ui.body.classList.contains('theme-dark') || ui.body.classList.contains('theme-stars') ? '#3e4c94' : '#a6c1ee';
    if (url === '') {
        ui.urlInput.style.borderColor = defaultColor;
    } else if (getItemIdFromUrl(url)) {
        ui.urlInput.style.borderColor = '#34d399'; // Green
    } else {
        ui.urlInput.style.borderColor = '#f87171'; // Red
    }
});

// --- Auth & Copy Logic ---
function handleAuthResponse(response) {
    if (response.error) { handleError(`Authorization failed: ${response.error}`, response); return; }
    gapi.client.setToken(response);
    ui.authContainer.style.display = 'none';
    ui.uploaderContainer.style.display = 'block';
    showMessage('Authorization successful!', 'green');
}
async function copyFile(sourceFile, destParentId) {
    showMessageWithLoader('Copying file...');
    const response = await gapi.client.drive.files.copy({
        fileId: sourceFile.id,
        resource: { name: sourceFile.name, parents: [destParentId] },
        fields: 'id, webViewLink'
    });
    showMessage(`File copied successfully!`, 'green', response.result.webViewLink);
}
async function copyFolder(sourceFolder, destParentId) {
    showMessageWithLoader('Analyzing folder structure...');
    const allItems = await listAllItems(sourceFolder.id);
    if (isCopyCancelled) { showMessage('Copy cancelled.', 'gray'); return; }

    const newFolder = await gapi.client.drive.files.create({
        resource: { name: sourceFolder.name, mimeType: 'application/vnd.google-apps.folder', parents: [destParentId] },
        fields: 'id, name'
    });

    const folderIdMap = new Map();
    folderIdMap.set(sourceFolder.id, newFolder.result.id);
    
    const allFolders = allItems.filter(item => item.mimeType === 'application/vnd.google-apps.folder');
    for (const folder of allFolders) {
         if (isCopyCancelled) { showMessage('Copy cancelled by user.', 'red'); return; }
         const parentId = folder.parents[0];
         const newParentId = folderIdMap.get(parentId);
         logMessage(`Creating subfolder: ${folder.name}`);
         const newSubFolder = await gapi.client.drive.files.create({
             resource: { name: folder.name, mimeType: 'application/vnd.google-apps.folder', parents: [newParentId] },
             fields: 'id'
         });
         folderIdMap.set(folder.id, newSubFolder.result.id);
    }

    const allFiles = allItems.filter(item => item.mimeType !== 'application/vnd.google-apps.folder');
    let filesCopied = 0;

    if (ui.speedBooster.checked) {
        logMessage(`Speed Booster enabled: Copying ${CONCURRENT_REQUESTS} files at a time.`);
        const queue = [...allFiles];
        while (queue.length > 0) {
            if (isCopyCancelled) { showMessage('Copy cancelled by user.', 'red'); return; }
            const chunk = queue.splice(0, CONCURRENT_REQUESTS);
            await Promise.all(chunk.map(async file => {
                const parentId = file.parents[0];
                const newParentId = folderIdMap.get(parentId);
                logMessage(`Copying: ${file.name}`);
                await gapi.client.drive.files.copy({
                    fileId: file.id,
                    resource: { name: file.name, parents: [newParentId] }
                });
                filesCopied++;
                updateProgressBar(filesCopied, allFiles.length);
            }));
        }
    } else {
        logMessage('Speed Booster disabled: Copying 1 file at a time.');
        for (const file of allFiles) {
            if (isCopyCancelled) { showMessage('Copy cancelled by user.', 'red'); return; }
            const parentId = file.parents[0];
            const newParentId = folderIdMap.get(parentId);
            logMessage(`Copying: ${file.name}`);
            await gapi.client.drive.files.copy({
                fileId: file.id,
                resource: { name: file.name, parents: [newParentId] }
            });
            filesCopied++;
            updateProgressBar(filesCopied, allFiles.length);
        }
    }

    if (!isCopyCancelled) {
        showMessage('Folder and all its contents copied successfully!', 'green');
    }
}
async function listAllItems(folderId) {
    let allItems = [];
    let foldersToProcess = [folderId];
    let processedFolders = new Set();

    while(foldersToProcess.length > 0) {
        let currentFolderId = foldersToProcess.shift();
        if(processedFolders.has(currentFolderId)) continue;
        processedFolders.add(currentFolderId);
        let pageToken = null;
        do {
            const response = await gapi.client.drive.files.list({
                q: `'${currentFolderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, parents)',
                pageSize: 1000,
                pageToken: pageToken
            });
            
            for(const item of response.result.files) {
                allItems.push(item);
                if(item.mimeType === 'application/vnd.google-apps.folder') {
                    foldersToProcess.push(item.id);
                }
            }
            pageToken = response.result.nextPageToken;
        } while (pageToken);
    }
    return allItems;
}

// --- Utility Functions ---
function getItemIdFromUrl(url) {
    const regexes = [
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/
    ];
    for (const regex of regexes) {
        const match = url.match(regex);
        if (match && match[1]) return match[1];
    }
    return null;
}

function showMessage(text, status, linkUrl = null) {
    ui.messageContainer.innerHTML = '';
    
    const p = document.createElement('p');
    p.className = 'flex items-center justify-center';

    let icon = '';
    const colorClasses = { red: 'text-red-400', green: 'text-green-400', gray: 'text-secondary' };
    p.classList.add(colorClasses[status] || 'text-secondary');

    if (status === 'green') {
        icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (status === 'red') {
        icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }
    
    p.innerHTML = `${icon}<span>${text}</span>`;
    ui.messageContainer.appendChild(p);

    if (linkUrl) {
        const link = document.createElement('a');
        link.href = linkUrl;
        link.textContent = 'View Item';
        link.target = '_blank';
        link.className = 'text-blue-400 hover:underline ml-2';
        
        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        copyBtn.className = 'text-blue-400 hover:text-white';
        copyBtn.title = 'Copy Link';
        copyBtn.onclick = () => {
            document.execCommand('copy');
            showMessage('Link copied to clipboard!', 'green');
        };

        p.appendChild(link);
        p.appendChild(copyBtn);
    }
}

function showMessageWithLoader(text) {
    ui.messageContainer.innerHTML = `
        <div class="loader"></div>
        <p class="text-secondary">${text}</p>
        <div class="progress-bar-container mt-4"><div id="progressBar" class="progress-bar"></div></div>
        <div id="log-container" class="mt-2"></div>
        <button id="cancel_button" class="mt-4 w-1/2 mx-auto bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Cancel</button>
    `;
    document.getElementById('cancel_button').onclick = () => { isCopyCancelled = true; };
}

function updateProgressBar(current, total) {
    const bar = document.getElementById('progressBar');
    if (bar) {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        bar.style.width = `${percentage}%`;
    }
}

function logMessage(text) {
    const logContainer = document.getElementById('log-container');
    if(logContainer) {
        const p = document.createElement('p');
        p.textContent = text;
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

function handleError(userMessage, errorObject) {
    console.error(userMessage, errorObject || '');
    showMessage(userMessage, 'red');
    ui.copyButton.disabled = false;
}

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
        .then(registration => {
            console.log('ServiceWorker registration successful!');
        })
        .catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}