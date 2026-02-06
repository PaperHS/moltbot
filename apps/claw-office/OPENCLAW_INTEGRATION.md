# OpenClaw + ClawOffice Integration

To connect OpenClaw with ClawOffice (WorkAdventure), follow these steps:

## 1. Environment Setup

The integration relies on environment variables to tell OpenClaw where the office server is.

Add these to your `~/.zshrc` or `~/.bashrc`:

```bash
# ClawOffice Configuration
export OFFICE_API_BASE="http://localhost:3001"
export OFFICE_API_KEY="openclaw-default-key"
```

Then reload your shell:
```bash
source ~/.zshrc
```

## 2. Start the Servers

You need to run both the office server and the OpenClaw agent.

**Terminal 1 (Office Server):**
```bash
pnpm office:start
```
*Access the office viewer at: http://localhost:3001*

**Terminal 2 (OpenClaw):**
```bash
pnpm dev
```

## 3. Usage

Once both are running, you can control your character in the office from OpenClaw.

**Commands:**

*   **Bind to a character**:
    ```
    /office-bot bind alvin
    ```
    *(Available IDs: pm, xm, coder, alvin)*

*   **Move around**:
    ```
    /office-bot goto pantry
    /office-bot move up
    ```

*   **Chat (appears in office)**:
    ```
    /office-bot say Hello everyone!
    ```

*   **Start Life Simulation** (Autonomous wandering/chatting):
    ```
    /office-bot simulate
    ```

*   **Broadcast to everyone**:
    ```
    /office-bot say group_all Meeting in 5 minutes!
    ```

## 4. Automation (Optional)

You can make OpenClaw automatically update your status in the office based on your messages.

1.  Make sure the `office-navigation` plugin is installed (check `openclaw plugins`).
2.  Set your Bot ID:
    ```bash
    export OFFICE_BOT_ID="alvin"
    ```
3.  When you send messages in OpenClaw, your character will show as "Working". When you stop, it will go to "Idle".
