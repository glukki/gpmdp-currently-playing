const fs = require("fs");
const WebSocket = require("ws");

const OUTPUT_FILE = process.argv[2];

if (!OUTPUT_FILE) {
  console.error("Output file not defined");
  process.exit(1);
}

const writeToFile = text => {
  fs.writeFile(OUTPUT_FILE, text, err => err && console.error(err));
};

const wait = async time => new Promise(res => setTimeout(res, time));
const once = fn => {
  let called = false;
  return () => !called && (called = true) && fn();
};

const connect = (url, messageHandler) => {
  let ws = null;
  let retryCount = 0;

  const close = () => ws && ws.terminate();
  const onOpen = () => {
    console.log("> connected", new Date());
    retryCount = 0;
    ws = ws;
  };

  const retry = async err => {
    ws = null;

    waitTime = Math.min(5 * 60 * 1000, Math.pow(2, retryCount));
    if (waitTime) {
      await wait(waitTime);
    }

    console.log("> connecting", new Date());

    const retryOnce = once(retry);
    ws = new WebSocket(url);
    ws.on("message", messageHandler);
    ws.on("open", onOpen);
    ws.on("error", retryOnce);
    ws.on("close", retryOnce);

    retryCount += 1;
  };

  retry();
  return close;
};

let latestTrack = "";
const separator = "  #  ";
const wsHandlers = new Map();

wsHandlers.set("track", ({ artist, title }) => {
  if (artist === null && title === null) {
    return;
  }

  const output = `${artist} - ${title}${separator}`;
  console.log("Track:", output);

  latestTrack = output;
  return writeToFile(output);
});

wsHandlers.set("playState", payload => {
  console.log("Playing: ", payload);
  if (!payload) {
    return writeToFile("");
  }
  if (payload && latestTrack) {
    return writeToFile(latestTrack);
  }
});

const handleMessage = msg => {
  const { channel, payload } = JSON.parse(msg);

  if (wsHandlers.has(channel)) {
    return wsHandlers.get(channel)(payload);
  }
};

const disconnect = connect("ws://localhost:5672", handleMessage);
