import { google } from "googleapis";
import * as functions from "@google-cloud/functions-framework";
import { promises as fs } from "fs";
import moment from "moment";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKEN_PATH = path.join(__dirname, "assets/auth/token.json");
const SLACK_HOOK_URL =
  "https://hooks.slack.com/services/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";
const CURRENT_DRIVE_ID = "0AEX39ZBwT0_bUk9PVA";

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

const authorize = async () => {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  } else {
    throw new Error("No credentials found");
  }
};

functions.http("changeEventHook", (req, res) => {
  console.log("Hook Message received");
  if (req.headers["x-goog-resource-state"] === "sync") {
    console.log("Sync event received");
    res.status(200).send("Sync event received");
  } else {
    console.log("Change event received");
    authorize().then(async (authClient) => {
      const drive = google.driveactivity({ version: "v2", auth: authClient });
      const response = await drive.activity.query({
        requestBody: {
          ancestorName: `items/${CURRENT_DRIVE_ID}`,
          consolidationStrategy: {
            legacy: {},
          },
          pageSize: 1,
          filter: `time > \"${moment()
            .subtract(20, "minutes")
            .toISOString()}\"`,
        },
      });
      const activities = response.data.activities;
      if (activities && activities.length > 0) {
        console.log("Activities found");
        const activity = activities[0];
        const actor = activity.actors[0];
        const target = activity.targets[0];
        const time = moment(activity.timestamp).format(
          "HH:mm:ss [on] DD-MMM-YYYY"
        );
        let actorEmail = "";
        if (actor.user.knownUser.personName) {
          const people = google.people({ version: "v1", auth: authClient });
          const response = await people.people.get({
            resourceName: actor.user.knownUser.personName,
            personFields: "emailAddresses",
          });
          if (!response.data.emailAddresses) {
            console.log("No email addresses found.");
          } else if (response.data.emailAddresses.length === 0) {
            console.log("No email addresses found.");
          } else {
            actorEmail = response.data.emailAddresses[0].value;
          }
        }
        if (activity.primaryActionDetail.rename) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` renamed \`${target.driveItem.title}\` from \`${activity.primaryActionDetail.rename.oldTitle}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.move) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` moved \`${
                      target.driveItem.title
                    }\` from \`${
                      activity.primaryActionDetail.move.removedParents
                        ? activity.primaryActionDetail.move.removedParents[0]
                            .title
                        : "Unknown"
                    }\` to \`${
                      activity.primaryActionDetail.move.addedParents
                        ? activity.primaryActionDetail.move.addedParents[0]
                            .title
                        : "Unknown"
                    }\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.delete) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` deleted \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.restore) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` restored \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.create) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` created \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.edit) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` edited \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.comment) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",

                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` commented on \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };

          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.permissionChange) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` changed permissions for \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };

          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.settingsChange) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },

              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` changed settings for \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        } else if (activity.primaryActionDetail.reference) {
          const payload = {
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: "Google Drive Activity",
                },
              },
              {
                type: "divider",
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: Object.entries({
                    drive: `${target.driveItem.owner.drive.title}\``,
                    isSharedDrive: `${
                      target.driveItem.owner.teamDrive.name ? "Yes" : "No"
                    }`,
                    message: `\`${actorEmail}\` referenced \`${target.driveItem.title}\` at \`${time}\``,
                  })
                    .map((entry) => `${entry[0]}:\t*${entry[1]}*`)
                    .join("\n"),
                },
              },
            ],
          };
          const response = await fetch(SLACK_HOOK_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" },
          });
        }

        console.log("Message sent to Slack");
        res.status(200).send("Message sent to Slack");
      } else {
        console.log("No activities found");
        res.status(200).send("No activities found");
      }
    });
  }
});
