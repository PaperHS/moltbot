/// <reference path="../node_modules/@workadventure/iframe-api-typings/iframe_api.d.ts" />

console.log('🚀 Smart Bot System Loaded!');

// --- Configuration ---
// Define the bots and their Tiled Layer names
const bots = [
    { 
        id: "pm", 
        name: "老刘",
        layers: { desk: "Bot_PM_Desk", pantry: "Bot_PM_Pantry" },
        messages: { desk: "需求文档还在改...", pantry: "来喝杯咖啡提提神。" }
    },
    { 
        id: "xm", 
        name: "小美",
        layers: { desk: "Bot_XM_Desk", pantry: "Bot_XM_Pantry" },
        messages: { desk: "PS 崩溃了！", pantry: "奶茶七分糖。" }
    },
    { 
        id: "coder", 
        name: "老叶",
        layers: { desk: "Bot_Coder_Desk", pantry: "Bot_Coder_Pantry" },
        messages: { desk: "编译中...", pantry: "摸鱼是生产力。" }
    },
    { 
        id: "alvin", 
        name: "Alvin",
        layers: { desk: "Bot_Alvin_Desk", pantry: "Bot_Alvin_Pantry" },
        messages: { desk: "看报表中...", pantry: "最近大家辛苦了。" }
    }
];

// --- State Simulation ---
// In a real app, you would fetch this from an API
function simulateBotStates() {
    bots.forEach(bot => {
        const rand = Math.random();
        
        // 20% Offline (Hidden)
        if (rand < 0.2) {
            WA.room.hideLayer(bot.layers.desk);
            WA.room.hideLayer(bot.layers.pantry);
        } 
        // 50% Working (At Desk)
        else if (rand < 0.7) {
            WA.room.showLayer(bot.layers.desk);
            WA.room.hideLayer(bot.layers.pantry);
        } 
        // 30% Idle (At Pantry)
        else {
            WA.room.hideLayer(bot.layers.desk);
            WA.room.showLayer(bot.layers.pantry);
        }
    });
}

// --- Initialization ---
WA.onInit().then(() => {
    console.log("WorkAdventure API Ready");
    
    // Initial State
    simulateBotStates();

    // Update every 10 seconds
    setInterval(() => {
        simulateBotStates();
        console.log("🔄 Bot states updated");
    }, 10000);

    // Interaction Logic (Clicking or Walking near)
    // Note: Since we are toggling layers, we can't easily attach zones dynamically unless we have zones for ALL spots.
    // Ideally, you draw "Interaction Zones" in Tiled for both Desk and Pantry locations for each bot.
});
