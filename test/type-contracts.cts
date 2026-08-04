import core = require("@handrail/bug-reporter");
import server = require("@handrail/bug-reporter/server");
import react = require("@handrail/bug-reporter/react");

const browserRuntime: "browser" = core.SDK_IDENTITY.reporter_sdk_runtime;
const nodeRuntime: "node" = server.stampReport({
  title: "CommonJS server issue",
}).reporter_sdk_runtime;
const reactRuntime: "react" = react.SDK_IDENTITY.reporter_sdk_runtime;

void browserRuntime;
void nodeRuntime;
void reactRuntime;
