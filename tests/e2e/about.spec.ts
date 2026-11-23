import { expect, test } from "./fixtures"

// PLAN 15.8: Help › About shows the third-party notices shipped with the app (read from its
// own files: the offline guard fails the test on any other request): the package list at
// once, the licence texts when asked for.
test("About lists the third-party notices", async ({ page }) => {
  await page.getByRole("menuitem", { name: "Help" }).click()
  await page.getByRole("menuitem", { name: "About StudioVD" }).click()
  const dialog = page.getByRole("dialog", { name: "StudioVD" })
  await dialog.getByRole("button", { name: "Third-party notices" }).click()
  const notices = dialog.getByLabel("Third-party notices")
  await expect(notices).toContainText("crate  reqwest")
  await expect(notices).toContainText("npm    three")
  await expect(notices).toContainText("occt-import-js")
  // The licence texts (about 2 MB) only on request: slow to lay out on a modest machine.
  await expect(notices).not.toContainText("Permission is hereby granted")
  await dialog.getByRole("button", { name: "Show the licence texts" }).click()
  await expect(notices).toContainText("Permission is hereby granted", { timeout: 30_000 })
})
