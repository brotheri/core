import { isMainThread, parentPort } from "worker_threads";
import mongoInit from "../bootstrap/mongodb";
import { hostStalker } from "./host-monitor";
import { ioMonitorer } from "./io-monitor";

class MonitoringModule {
  start() {
    hostStalker.start();
    ioMonitorer.start();
  }

  stop() {
    hostStalker.stop();
    ioMonitorer.stop();
  }

  isRunning() {
    return true;
  }
}

const antiMonitor = new MonitoringModule();

if (!isMainThread) {
  // intialize mongo immediately
  (async () => {
    await mongoInit();
  })();
}

if (parentPort !== null) {
  parentPort.on("message", async function (event) {
    const { type, data } = event;
    if (type === "START") {
      antiMonitor.start();
    } else if (type === "STOP") {
      antiMonitor.stop();
    } else if (type === "PEEK") {
      parentPort?.postMessage({ value: antiMonitor.isRunning() });
    }
  });
}
