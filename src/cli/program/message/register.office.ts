import type { Command } from "commander";
import axios from "axios";
import type { MessageCliHelpers } from "./helpers.js";
import { formatHelpExamples } from "../../../cli/help-format.js";
import { defaultRuntime } from "../../../runtime.js";
import { theme } from "../../../terminal/theme.js";

const OFFICE_API_BASE = process.env.OFFICE_API_BASE || "http://localhost:3001";
const OFFICE_API_KEY = process.env.OFFICE_API_KEY || "openclaw-default-key";

async function apiRequest(method: string, endpoint: string, data?: any) {
  try {
    const url = `${OFFICE_API_BASE}${endpoint}`;
    const response = await axios({
      method,
      url,
      data,
      headers: {
        "x-api-key": OFFICE_API_KEY,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (err: any) {
    if (err.response) {
      throw new Error(err.response.data?.error || `HTTP ${err.response.status}`);
    }
    throw new Error(err.message);
  }
}

export function registerOfficeCommands(message: Command, helpers: MessageCliHelpers) {
  const office = message
    .command("office")
    .description("Control ClawOffice bots")
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ["openclaw message office bind --bot-id alvin", "Bind to the 'alvin' bot."],
  ["openclaw message office goto --location pantry", "Send your bot to the pantry."],
  ["openclaw message office say --text 'Hello world'", "Make your bot speak."],
  ["openclaw message office simulate", "Start autonomous mode."],
])}
`,
    );

  // Bind
  office
    .command("bind")
    .description("Bind OpenClaw to a specific office bot")
    .requiredOption("--bot-id <id>", "Bot ID to bind (pm, xm, coder, alvin)")
    .action(async (options) => {
      try {
        const res = await apiRequest("POST", `/api/bots/${options.botId}/bind`, {
          name: "OpenClaw User",
        });
        defaultRuntime.log(`✅ Bound to **${res.bot.name}** (${res.bot.character})`);
      } catch (e: any) {
        defaultRuntime.error(`❌ Error: ${e.message}`);
        process.exit(1);
      }
    });

  // Unbind
  office
    .command("unbind")
    .description("Unbind from the current bot")
    .requiredOption("--bot-id <id>", "Bot ID to unbind")
    .action(async (options) => {
      try {
        await apiRequest("POST", `/api/bots/${options.botId}/unbind`);
        defaultRuntime.log(`👋 Unbound from ${options.botId}`);
      } catch (e: any) {
        defaultRuntime.error(`❌ Error: ${e.message}`);
        process.exit(1);
      }
    });

  // Move
  office
    .command("move")
    .description("Move the bot in a direction")
    .argument("<direction>", "up, down, left, right, stop")
    .requiredOption("--bot-id <id>", "Bot ID")
    .action(async (direction, options) => {
      try {
        await apiRequest("POST", `/api/bots/${options.botId}/move`, { direction });
        defaultRuntime.log(`Moving ${direction}`);
      } catch (e: any) {
        defaultRuntime.error(`❌ Error: ${e.message}`);
        process.exit(1);
      }
    });

  // Goto
  office
    .command("goto")
    .description("Navigate to a location")
    .option("--location <name>", "Location name (pantry, desk_alvin, etc)")
    .requiredOption("--bot-id <id>", "Bot ID")
    .action(async (options) => {
      if (!options.location) {
        console.error("Error: --location is required");
        process.exit(1);
      }
      try {
        const res = await apiRequest("POST", `/api/bots/${options.botId}/goto`, {
          location: options.location,
        });
        defaultRuntime.log(`🎯 Navigating to ${options.location} (Path: ${res.pathLength} tiles)`);
      } catch (e: any) {
        defaultRuntime.error(`❌ Error: ${e.message}`);
        process.exit(1);
      }
    });

  // Say
  office
    .command("say")
    .description("Make the bot speak")
    .option("--text <message>", "Message to say")
    .requiredOption("--bot-id <id>", "Bot ID (use 'group_all' for broadcast)")
    .action(async (options) => {
      if (!options.text) {
        console.error("Error: --text is required");
        process.exit(1);
      }
      try {
        await apiRequest("POST", `/api/bots/${options.botId}/say`, { message: options.text });
        defaultRuntime.log(`💬 Sent: ${options.text}`);
      } catch (e: any) {
        defaultRuntime.error(`❌ Error: ${e.message}`);
        process.exit(1);
      }
    });

  // Simulate
  office
    .command("simulate")
    .description(
      "Toggle life simulation mode (CLI only supports trigger, persistent loop needs extension)",
    )
    .argument("[action]", "start or stop", "start")
    .action(async (action) => {
      defaultRuntime.log(
        "⚠️ Simulation mode requires the extension to be running in the Agent/Gateway.",
      );
      defaultRuntime.log(
        "To run simulation, please use the /office-bot simulate command within a session.",
      );
    });
}
