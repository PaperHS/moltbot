---
name: office-bot
description: Control virtual office characters in the ClawOffice map viewer.
metadata:
  {
    "openclaw":
      {
        "emoji": "🏢",
        "requires": { "skills": ["canvas"] }
      }
  }
---

# Office Bot Control

Control virtual characters in the ClawOffice map viewer via canvas eval.

## Setup

1. Start the office map viewer (dev server or canvas host)
2. Present the map in canvas:
   ```
   canvas action:present node:<node-id> target:http://localhost:5173/
   ```

## Available Characters

| ID     | Name           | Role    |
|--------|----------------|---------|
| pm     | 老刘 (PM)      | PM      |
| xm     | 小美 (Design)  | Designer|
| coder  | 老叶 (Dev)     | Developer|
| alvin  | Alvin (Boss)   | Boss    |

## API Functions

All functions are called via `canvas action:eval` with JavaScript:

### List all bots
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.listBots())"
```

### Bind to a bot (required before controlling)
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.bindBot('alvin', 'my-claw-id'))"
```

### Move bot
Directions: `up`, `down`, `left`, `right`, `stop`
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.move('alvin', 'right'))"
```

### Move to location
Locations: `desk_pm`, `desk_xm`, `desk_coder`, `desk_alvin`, `pantry`, `spawn`
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.moveTo('alvin', 'pantry'))"
```

### Set state
States: `working`, `coffee`, `offline`
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.setState('alvin', 'coffee'))"
```

### Say something (speech bubble)
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.say('alvin', 'Hello!', 5000))"
```

### Get status
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.getStatus('alvin'))"
```

### Unbind bot
```
canvas action:eval node:<id> javaScript:"JSON.stringify(clawControl.unbindBot('alvin'))"
```

## Workflow Example

1. First, list available bots to see who's free
2. Bind to an unbound bot with your unique ID
3. Control the bot (move, setState, say)
4. Use snapshot to see current state
5. Unbind when done

## Tips

- Each OpenClaw instance should use a unique clawId when binding
- Bound bots show a purple border
- Speech bubbles auto-dismiss after the specified duration
- Use `moveTo` for automatic pathfinding to locations
- Use `move` for manual direction control
