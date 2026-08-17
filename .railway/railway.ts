import { defineRailway, project, service } from "railway/iac";

// NOTE: this file documents the intended shape but was not the path used to
// create the live project — `railway config apply` hit a bug resolving the
// railway/iac module when this was written, so the actual service was
// provisioned via `railway add` + `railway api` (GraphQL) + `railway up`.
//
// Just one service. Every simulated-hardware bridge (orbbec/clarius/vemo/
// tekscan/vetscan/patient-station WS bridges + the FLIR REST sim) and the
// main web/API server all run in server/services/web.js, path-routed on one
// HTTP server — there's no isolation benefit to splitting pure simulators
// with no real device behind them into separate services, and one service
// is simpler to run and deploy than eight.
export default defineRailway(() => {
  const web = service("web", {
    start: "node server/services/web.js",
    env: { NODE_ENV: "production" },
  });

  return project("Vitarus", {
    resources: [web],
  });
});
