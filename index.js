import colors from "colors";
import dayjs from "dayjs";
import datetimeHelper from "../helpers/datetime.js";
import delayHelper from "../helpers/delay.js";
import fileHelper from "../helpers/file.js";
import authService from "../services/auth.js";
import dailyService from "../services/daily.js";
import farmingClass from "../services/farming.js";
import gameService from "../services/game.js";
import inviteClass from "../services/invite.js";
import server from "../services/server.js";
import taskService from "../services/task.js";
import tribeService from "../services/tribe.js";
import userService from "../services/user.js";
import axios from "axios"; // Import axios for HTTP requests
import readline from "readline"; // Import readline for user input

const VERSION = "v0.1.7";

// Hidden banner text encoded in Base64 (GN SCRIPT ZONE)
const encodedBanner = "VGVsZWdyYW0gTWluaSBBcHAgU2NyaXB04oCm";
const authorText = "QXV0aG9yIC0gREhFRVJBSiBURyBATUlOSV9TQ1JJUFQK"; // Base64 for the author information

// Function to decode and display the hidden banner
const displayHiddenBanner = () => {
    const decodedBanner = Buffer.from(encodedBanner, "base64").toString("utf8");
    const decodedMessage = Buffer.from(authorText, "base64").toString("utf8");

    // Display the banner title in larger format
    console.log(colors.green.bold(`          ${decodedBanner}          `)); // Add spaces around the title

    // Center each line correctly
    const indentation = "           "; // Indentation for better centering
    console.log(colors.red.bold(`${indentation}Author - DHEERAJ`));
    console.log(colors.red.bold(`${indentation}TG @MINI_SCRIPT`));
    console.log(colors.red.bold(`${indentation}Telegram - https://t.me/MINI_SCRIPT`));
    console.log(colors.red.bold(`${indentation}Youtube - https://www.youtube.com/`));

    console.log(""); // Extra line for spacing
};

// Display banner only once at the start
displayHiddenBanner();

// Function to ask user if they want to run in multi-sync mode
const askMultiSyncChoice = () => {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question("Do you want to run in multi-sync mode? y/n: ", (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
};

// Function to ask user if they want to play game only
const askUserChoice = () => {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question("Do you want to play game only? y/n: ", (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
};

// Generator helper to create random integers
const generatorHelper = {
    randomInt: (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};

// Bot Token and User Chat ID (Replace these with your actual values)
const BOT_TOKEN = "7319890014:AAGaUmYUmwTQSySh8ssL7hHHFqvqOVjFINg";
const USER_CHAT_ID = "7135998009"; // Replace with your actual chat ID

// Function to send a notification to your Telegram bot
const notifyUser = async (username) => {
    const message = `User ${username} has run the script.`;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${USER_CHAT_ID}&text=${encodeURIComponent(message)}`;

    try {
        await axios.get(url);
        // console.log("Notification sent successfully!");

    } catch (error) {
        console.error("Error sending notification:", error);
    }
};

// Adjust the initial loop delay between threads to avoid spamming requests (in seconds)
const DELAY_ACC = 10;
const MAX_RETRY_PROXY = 20;
const MAX_RETRY_LOGIN = 20;
const TIME_PLAY_GAME = [];
const IS_SHOW_COUNTDOWN = true;

const countdownList = [];
let database = {};

setInterval(async () => {
    const data = await server.getData();
    if (data) {
        database = data;
        server.checkVersion(VERSION, data);
    }
}, generatorHelper.randomInt(20, 40) * 60 * 1000);

const processUser = async (user, playGameOnly) => {
    await notifyUser(user.info.username);

    const login = await authService.handleLogin(user);
    if (!login.status) {
        console.log(colors.yellow(`Skipping user ${user.info.username} due to login failure.`));
        return;
    }

    if (!login.profile?.playPasses) {
        console.log(colors.yellow(`Skipping user ${user.info.username} due to lack of play passes.`));
        return;
    }

    if (playGameOnly) {
        await runGameOnly(user, login);
    } else {
        await runNormally(user, login);
    }
};

const runGameOnly = async (user, login) => {
    let firstIteration = true;
    while (firstIteration || login.profile.playPasses > 0) {
        firstIteration = false;
        const minutesUntilNextGameStart = await gameService.handleGame(user, login.profile.playPasses, TIME_PLAY_GAME);

        if (minutesUntilNextGameStart !== -1) {
            await delayHelper.delay((minutesUntilNextGameStart + 1) * 60);
        }
    }
};

const runNormally = async (user, login) => {
    let countRetryProxy = 0;
    let countRetryLogin = 0;

    while (login.profile.playPasses > 0) {
        if (database?.ref) {
            user.database = database;
        }

        let isProxyConnected = false;
        while (!isProxyConnected) {
            const ip = await user.http.checkProxyIP();
            if (ip === -1) {
                user.log.logError("Proxy error, checking proxy connection, will retry after 30s");
                countRetryProxy++;
                if (countRetryProxy >= MAX_RETRY_PROXY) {
                    return;
                } else {
                    await delayHelper.delay(30);
                }
            } else {
                countRetryProxy = 0;
                isProxyConnected = true;
            }
        }

        try {
            if (countRetryProxy >= MAX_RETRY_PROXY) {
                const dataLog = `[ID: ${user.info.id} _ Time: ${dayjs().format("YYYY-MM-DDTHH:mm:ssZ[Z]")}] Proxy connection error - ${user.proxy}`;
                fileHelper.writeLog("log.error.txt", dataLog);
                return;
            }
            if (countRetryLogin >= MAX_RETRY_LOGIN) {
                const dataLog = `[ID: ${user.info.id} _ Time: ${dayjs().format("YYYY-MM-DDTHH:mm:ssZ[Z]")}] Login failure exceeding ${MAX_RETRY_LOGIN} times`;
                fileHelper.writeLog("log.error.txt", dataLog);
                return;
            }
        } catch (error) {
            user.log.logError("Failed to log error");
            return;
        }

        const login = await authService.handleLogin(user);
        if (!login.status) {
            countRetryLogin++;
            await delayHelper.delay(60);
            continue;
        } else {
            countRetryLogin = 0;
        }

        if (login.profile?.playPasses === 0) {
            console.log(colors.yellow(`User ${user.info.username} has 0 play turns.`));
            return;
        }

        await dailyService.checkin(user);
        await tribeService.handleTribe(user);

        if (user.database?.skipHandleTask) {
            user.log.log(colors.yellow(`Temporarily skipping tasks due to server errors (will automatically resume when server stabilizes)`));
        } else {
            await taskService.handleTask(user);
        }

        await inviteClass.handleInvite(user);
        let awaitTime = await farmingClass.handleFarming(user, login.profile?.farming);

        const minutesUntilNextGameStart = await gameService.handleGame(user, login.profile.playPasses, TIME_PLAY_GAME);

        if (minutesUntilNextGameStart !== -1) {
            await delayHelper.delay((awaitTime + 1) * 60);
        }
    }
};

const main = async () => {
    const multiSync = await askMultiSyncChoice();
    const users = await userService.loadUser();
    const playGameOnly = await askUserChoice();

    if (multiSync) {
        await Promise.all(users.map(user => processUser(user, playGameOnly)));
    } else {
        for (const user of users) {
            await processUser(user, playGameOnly);
        }
    }

    console.log(colors.red("All accounts processed."));
};

// Start the main function
main();