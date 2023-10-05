import { google } from "googleapis";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { authenticate } from "@google-cloud/local-auth";
import process from "process";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCOPES = [
  "https://www.googleapis.com/auth/docs",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.apps.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.photos.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.activity",
  "https://www.googleapis.com/auth/drive.activity.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const TOKEN_PATH = path.join(__dirname, "assets/token.json");
const CREDENTIALS_PATH = path.join(__dirname, "assets/credentials.json");

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

async function listFiles(authClient) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.list({
    pageSize: 100,
    fields:
      "nextPageToken, files(id, name, mimeType, fileExtension, kind, size)",
    orderBy: "name asc",
    supportsAllDrives: true,
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }
  console.log("Your Files : \n");
  console.table(files, ["kind", "id", "name", "fileExtension", "size"]);
}

async function listFileParentTree(authClient, fileId) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.get({
    fileId,
    fields: "parents, name, mimeType",
    supportsAllDrives: true,
  });
  const parents = res.data.parents;
  if (!parents) {
    console.log("No parents found.");
    return;
  }
  if (parents.length === 0) {
    console.log("No parents found.");
    return;
  }
  console.log(`Parent for '${res.data.name}' [${res.data.mimeType}]`);
  parents.forEach(async (parent) => {
    const res = await drive.files.get({
      fileId: parent,
      fields: "name, parents, id",
      supportsAllDrives: true,
    });
    console.log(res.data.name);
    if (res.data.parents) {
      listFileParentTree(authClient, res.data.id);
    }
  });
}

async function listDrives(authClient) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.drives.list({
    pageSize: 100,
    fields: "nextPageToken, drives(id, name)",
  });
  const drives = res.data.drives;
  if (drives.length === 0) {
    console.log("No drives found.");
    return;
  }
  console.log("Your Drives : \n");
  console.table(drives, ["id", "name"]);
}

async function watchFileChanges(authClient, fileId, hookUrl) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.watch({
    fileId,
    requestBody: {
      id: uuidv4(),
      type: "web_hook",
      address: hookUrl,
      expiration: moment().add(1, "day").unix() * 1000,
    },
    supportsAllDrives: true,
  });
  console.log(res.data);
}

async function watchChangesAndNotify(authClient, driveId, hookUrl) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const tokenRes = await drive.changes.getStartPageToken({
    driveId,
    supportsAllDrives: true,
  });
  const res = await drive.changes.watch({
    driveId,
    requestBody: {
      id: uuidv4(),
      type: "web_hook",
      address: hookUrl,
    },
    supportsAllDrives: true,
    pageToken: tokenRes.data.startPageToken,
  });
  console.log(res.data);
}

async function getChangesFromMessageNumber(authClient, driveId, messageNumber) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.changes.list({
    driveId,
    pageToken: messageNumber,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  console.log(res.data);
}

async function getDriveActivityWithin5Minutes(authClient, driveId) {
  const drive = google.driveactivity({ version: "v2", auth: authClient });
  const res = await drive.activity.query({
    requestBody: {
      ancestorName: `items/${driveId}`,
      consolidationStrategy: {
        legacy: {},
      },
      pageSize: 1,
      filter: `time > \"${moment().subtract(20, "minutes").toISOString()}\"`,
    },
  });
  console.log(JSON.stringify(res.data.activities[0]));
}

async function getPrimaryMailAddressFromPeoplesId(authClient, peoplesId) {
  const people = google.people({ version: "v1", auth: authClient });
  const res = await people.people.get({
    resourceName: peoplesId,
    personFields: "emailAddresses",
  });
  const emailAddresses = res.data.emailAddresses;
  if (!emailAddresses) {
    console.log("No email addresses found.");
    return;
  }
  if (emailAddresses.length === 0) {
    console.log("No email addresses found.");
    return;
  }
  console.log(emailAddresses[0].value);
}

function main() {
  console.log("A quick Google Drive API v3 test");
  console.log("================================");
  console.log("Available commands : ");
  console.log("  - listFiles");
  console.log("  - listDrives");
  console.log("  - listFileParents <fileId>");
  console.log("  - watchFileChanges <fileId> <hookUrl>");
  console.log("  - watchChangesAndNotify <driveId> <hookUrl>");
  console.log("  - getChangesFromMessageNumber <driveId> <messageNumber>");
  console.log("  - getDriveActivityWithin5Minutes <driveId>");
  console.log("  - getPrimaryMailAddressFromPeoplesId <peoplesId>");
  console.log("================================");
  console.log("Usage : ");
  console.log("  node src/index.js <command> <args>");
  console.log("================================");
  console.log("\n");

  const args = process.argv.slice(2);
  const command = args[0];
  const arg1 = args[1];
  const arg2 = args[2];
  switch (command) {
    case "listFiles":
      authorize()
        .then((auth) => listFiles(auth))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    case "listDrives":
      authorize()
        .then((auth) => listDrives(auth))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    case "listFileParents":
      authorize()
        .then((auth) => listFileParentTree(auth, arg1))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    case "watchFileChanges":
      authorize()
        .then((auth) => watchFileChanges(auth, arg1, arg2))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    case "watchChangesAndNotify":
      authorize()
        .then((auth) => watchChangesAndNotify(auth, arg1, arg2))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    case "getChangesFromMessageNumber":
      authorize()
        .then((auth) => getChangesFromMessageNumber(auth, arg1, arg2))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    case "getDriveActivityWithin5Minutes":
      authorize()
        .then((auth) => getDriveActivityWithin5Minutes(auth, arg1))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    case "getPrimaryMailAddressFromPeoplesId":
      authorize()
        .then((auth) => getPrimaryMailAddressFromPeoplesId(auth, arg1))
        .catch((err) => console.error(err) && process.exit(1));
      break;
    default:
      console.log("No command specified");
      break;
  }
}

main();
