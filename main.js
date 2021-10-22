// For help writing plugins, visit the documentation to get started:
//   https://support.insomnia.rest/article/26-plugins

const defaultSecretsKey = '_secret';
const obfuscatedValue = '******';
const replacement = /(wrk|req|fld)_/g;

//environment.exportSecretsKey || defaultSecretsKey

const fs = require('fs');
const electron = require('electron');

const exportAction = {
    label: 'Export Workspace',
    icon: 'fa-arrow-right',
    action: (context, models) => exportWorkspace(context, models),
};

const importAction = {
    label: 'Import Workspace',
    icon: 'fa-arrow-left',
    action: (context, models) => importWorkspace(context, models),
};


async function listSecrets(jsonData) {
    const secrets = [];
    jsonData.resources
        .filter(resource => {
            return resource._type === "environment";
        })
        .map(resource => {
            for (const [key, value] of Object.entries(resource.data)) {
                const exportSecretsKey = resource.data.insomnia_export_secrets_key || defaultSecretsKey;
                if (value[exportSecretsKey]) {
                    secrets.push({
                        env: resource._id,
                        envName: resource.name,
                        envSortKey: resource.metaSortKey,
                        key: key,
                        value: `${value[exportSecretsKey]}`
                    });
                }
            }
        })
    return secrets;
}

async function exportWorkspace(context, models) {

    const jsonData = JSON.parse(await context.data.export.insomnia({
        includePrivate: false,
        format: 'json',
        workspace: models.workspace,
    }));

    const secrets = await listSecrets(jsonData);

    await cleanUpStore(context.store, [`${models.workspace._id}:filePath`]);

    for (secret of secrets) {
        await context.store.setItem(`${models.workspace._id}:${secret.env}:secret:${secret.key}`, secret.value);

        try {
            const resource = jsonData.resources.find(
                resource => resource._id === secret.env
            );
            const exportSecretsKey = resource.data.insomnia_export_secrets_key || defaultSecretsKey;
            resource.data[secret.key][exportSecretsKey] = obfuscatedValue;
        } catch (e) {
            console.error(error)
        }

    }

    jsonData.resources.sort((a, b) => {
        const left = a._id.replace(replacement, '');
        const right = b._id.replace(replacement, '');
        if(left === right) {
            return 0; 
        }
        
        return left < right ? -1 : 1;
    });

    await saveExport(jsonData, context, models)
}

async function cleanUpStore(store, excludedKeys) {
    for (storedElement of await store.all()) {
        if (!excludedKeys.includes(storedElement.key)) {
            await store.removeItem(storedElement.key);
        }
    }
}

async function saveExport(jsonData, context, models) {

    const defaultFilePath = await context.store.getItem(`${models.workspace._id}:filePath`) || '.'

    const exportDialogResult = await electron.remote.dialog.showSaveDialog({
        title: 'Export Workspace',
        buttonLabel: 'Save',
        defaultPath: defaultFilePath,
        createDirectory: true,
        showOverwriteConfirmation: true,
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!exportDialogResult.canceled && typeof exportDialogResult.filePath !== "undefined") {
        const exportFilePath = exportDialogResult.filePath;
        await context.store.setItem(`${models.workspace._id}:filePath`, exportDialogResult.filePath);

        fs.writeFileSync(exportFilePath, JSON.stringify(jsonData, null, 2));
    }
}

function askSecrets(secrets, context, models) {

    secrets.sort((element1, element2) => element1.envSortKey - element2.envSortKey);

    return new Promise(async (resolve, reject) => {

        const currentJsonData = JSON.parse(await context.data.export.insomnia({
            includePrivate: false,
            format: 'json',
            workspace: models.workspace,
        }));

        for (secret of secrets) {

            const currentResource = currentJsonData.resources.find(
                resource => resource._id === secret.env
            );
            const exportSecretsKey = currentResource?.data?.insomnia_export_secrets_key || defaultSecretsKey;
            const currentValue = (currentResource?.data[secret.key] || {})[exportSecretsKey];

            const storedSecret = await context.store.getItem(`${models.workspace._id}:${secret.env}:secret:${secret.key}`);

            secret.value = await context.app.prompt(
                `Enter secret value for Environment "${secret.envName}"`,
                {
                    label: `${secret.key}`,
                    defaultValue: currentValue || storedSecret || '',
                    submitName: "Ok",
                    cancelable: false,
                }
            );
        }
        resolve(secrets);
    });
}

async function loadImport(context, models) {
    const defaultFilePath = await context.store.getItem(`${models.workspace._id}:filePath`) || '.'

    const importDialogResult = await electron.remote.dialog.showOpenDialog({
        title: 'Import Workspace',
        buttonLabel: 'Load',
        openFile: true,
        openDirectory: false,
        multiSelections: false,
        defaultPath: defaultFilePath,
        filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (!importDialogResult.canceled && typeof importDialogResult.filePaths[0] !== "undefined") {

        const importFilePath = importDialogResult.filePaths[0];
        await context.store.setItem(`${models.workspace._id}:filePath`, importFilePath);

        return JSON.parse(fs.readFileSync(importFilePath, 'utf-8'))
    }

    return null;
}

async function importWorkspace(context, models) {

    const jsonData = await loadImport(context, models)

    if (jsonData) {
        const secrets = await listSecrets(jsonData)

        askSecrets(secrets, context, models)
            .then(async secrets => {
                for (secret of secrets) {
                    const resource = jsonData.resources.find(
                        resource => resource._id === secret.env
                    )
                    const exportSecretsKey = resource.data.insomnia_export_secrets_key || defaultSecretsKey;
                    resource.data[secret.key][exportSecretsKey] = secret.value;
                    await context.store.setItem(`${models.workspace._id}:${secret.env}:secret:${secret.key}`, secret.value);
                }
                await context.data.import.raw(JSON.stringify(jsonData), { workspaceId: models.workspace._id });
            })
            .catch(error => console.error(error))
    }
}


module.exports = {
    workspaceActions: [exportAction, importAction]
};