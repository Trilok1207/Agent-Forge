import reactHooks from "eslint-plugin-react-hooks";
import base from "../../eslint.config.mjs";

export default [...base, reactHooks.configs.flat["recommended-latest"]];
