/**
 * Office Navigation Plugin
 *
 * Automatically sets bot task status when receiving/sending messages:
 * - message_received: Set status to "working", bot navigates to desk
 * - message_sent: Set status to "idle", bot returns to pantry
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Get the bot ID from environment variable
 */
function getBotId() {
  return process.env.OFFICE_BOT_ID?.trim() || null;
}

/**
 * Call office-bot skill to set task status
 */
async function setTaskStatus(status, description = '') {
  const botId = getBotId();

  if (!botId) {
    console.log('[office-navigation] OFFICE_BOT_ID not set, skipping');
    return;
  }

  try {
    const skill = process.env.OFFICE_BOT_SKILL || 'office-bot';
    const cmd = description
      ? `${skill} task-status ${status} ${description}`
      : `${skill} task-status ${status}`;

    console.log(`[office-navigation] Running: ${cmd}`);
    const { stdout, stderr } = await execAsync(cmd);

    if (stdout) {
      console.log(`[office-navigation] ${stdout.trim()}`);
    }
    if (stderr) {
      console.error(`[office-navigation] ${stderr.trim()}`);
    }
  } catch (err) {
    console.error('[office-navigation] Failed to set task status:', err.message);
  }
}

/**
 * Plugin registration function
 */
export default function register(api) {
  api.logger.info?.('[office-navigation] Registering hooks');

  // Hook: message_received - set status to working
  api.registerHook('message_received', async (event) => {
    api.logger.info?.('[office-navigation] Message received, setting status to working');

    // Extract message content for description
    const content = event?.content || '';
    const truncated = content.length > 50
      ? content.substring(0, 47) + '...'
      : content;

    await setTaskStatus('working', truncated);
  }, {
    register: true,
  });

  // Hook: message_sent - set status to idle
  api.registerHook('message_sent', async (event) => {
    api.logger.info?.('[office-navigation] Message sent, setting status to idle');
    await setTaskStatus('idle');
  }, {
    register: true,
  });

  api.logger.info?.('[office-navigation] Plugin registered successfully');
}
