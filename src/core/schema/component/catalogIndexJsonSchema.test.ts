import { z } from "zod"
import { describe, expect, it } from "vitest"
import { CatalogIndexSchema } from "./catalogIndex"

// The catalog repository (bmisho/studiovd-catalog) validates every index it signs against a
// JSON Schema copy of CatalogIndexSchema, so it never publishes an index this app refuses.
// This test keeps docs/formats/catalog-index.schema.json equal to the zod schema: after a
// schema change, regenerate it (`npx vitest run -u catalogIndexJsonSchema`) and copy it to the
// catalog repository's schema/ folder. Cross-reference rules (superRefine) are not in JSON
// Schema; the catalog's index builder checks those itself.
describe("catalog index JSON Schema", () => {
  it("matches the zod schema", async () => {
    const schema = z.toJSONSchema(CatalogIndexSchema, { io: "input" })
    await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot(
      "../../../../docs/formats/catalog-index.schema.json"
    )
  })
})
