import { promises as fs } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const dataDir = path.join(process.cwd(), ".e2e-data");

test("permanent account actions live in their proper settings sections", async ({
  context,
  page,
}) => {
  await fs.rm(dataDir, { recursive: true, force: true });

  await page.goto("/setup");
  await page.getByLabel("Your name").fill("Settings Test Owner");
  await page.getByLabel("Email").fill("settings.e2e@example.com");
  await page.getByLabel("Password").fill("E2e-password-2026");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Business name").fill("Settings Test LLC");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Keep Truck 1 for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Open the dashboard/ }).click();

  await context.addCookies([
    { name: "onroadbooks.locale", value: "es", url: "http://127.0.0.1:4173" },
  ]);
  await page.goto("/settings?section=data");

  await expect(page.getByRole("heading", { name: "Mi perfil", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Datos y cuenta", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Eliminar cuenta" })).toBeVisible();

  await page.getByRole("button", { name: "Eliminar cuenta" }).click();
  await expect(page.getByRole("dialog")).toContainText("¿Eliminar tu cuenta?");
  await expect(page.getByRole("button", { name: "Eliminar permanentemente" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancelar" }).click();

  await page.goto("/settings?section=business");
  await expect(page.getByRole("heading", { name: "Negocio y finanzas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar datos" })).toBeVisible();
  await page.getByRole("button", { name: "Borrar datos" }).click();
  await expect(page.getByRole("dialog")).toContainText("¿Borrar todos los datos del negocio?");
  await expect(page.getByRole("button", { name: "Borrar permanentemente" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Switching language from the live app must re-render server-owned page
  // content too, not only the client sidebar and dialogs.
  await page.getByRole("button", { name: "Preferencias de la aplicación" }).first().click();
  await page.getByRole("menuitemradio", { name: /English/ }).click();
  await expect(page.getByRole("heading", { name: "Business & finances" })).toBeVisible();
  await page.goto("/loads");
  await expect(page.getByRole("heading", { name: "Loads" })).toBeVisible();
  await expect(page.getByText("Booked revenue", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Display settings" }).first().click();
  await page.getByRole("menuitemradio", { name: /Español/ }).click();
  await expect(page.getByRole("heading", { name: "Cargas" })).toBeVisible();
  await expect(page.getByText("Ingresos registrados", { exact: true })).toBeVisible();
  await expect(page.getByText("Booked revenue", { exact: true })).toHaveCount(0);
});
