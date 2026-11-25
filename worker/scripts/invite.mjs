// Creates an invite code for one person and prints the commands and the link to send them.
// Usage: npm run invite -- "Jana Nováková"
import { randomBytes } from "node:crypto";

const name = process.argv.slice(2).join(" ").trim();
if (!name) {
  console.error('Usage: npm run invite -- "Name"');
  process.exit(1);
}
const code = randomBytes(9).toString("base64url");
console.log(`Store it:   npx wrangler kv key put --binding KV --remote "code:${code}" ${JSON.stringify(name)}`);
console.log(`Send this:  https://romanzdk.github.io/zahraj-mi/?kod=${code}`);
console.log(`Revoke:     npx wrangler kv key delete --binding KV --remote "code:${code}"`);
