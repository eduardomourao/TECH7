import { app, runStartupChecks, STATIC_DIR } from "./app.js";
import { safeJson } from "./lib/env.js";

const PORT = Number(process.env.PORT || 3000);

runStartupChecks();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    safeJson({
      msg: "server listening",
      port: PORT,
      staticDir: STATIC_DIR
    })
  );
});
