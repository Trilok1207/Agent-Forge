import nextVitals from "eslint-config-next/core-web-vitals";
import base from "../../eslint.config.mjs";

const config = [...base, ...nextVitals];

export default config;
