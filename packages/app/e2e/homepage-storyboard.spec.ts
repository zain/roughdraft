import { expect, test } from "@playwright/test";
import { logE2eEvent } from "./helpers";

test.describe("homepage workflow storyboard", () => {
  test("renders the plan-review storyboard above the Markdown section @smoke", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    const storyboard = page.locator("[data-homepage-workflow-storyboard]");
    await expect(storyboard).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "How it works",
      }),
    ).toBeVisible();

    await expect(
      storyboard.locator("[data-homepage-workflow-scene]"),
    ).toHaveCount(6);
    await expect(
      storyboard.getByText("Ask for a plan", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("The agent works normally", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("Roughdraft opens the plan", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("Leave comments and suggestions", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("Click Done Reviewing", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("The agent resumes", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText(
        "Let's make the homepage more persuasive. Write a plan first.",
      ),
    ).toBeVisible();

    const agentWorkTranscript = storyboard.locator(
      ".homepage-workflow-terminal-reveal-stack",
    );
    await expect(agentWorkTranscript).toHaveAttribute(
      "data-agent-work-visible",
      "false",
    );
    const hiddenTranscriptState = await agentWorkTranscript.evaluate(
      (element) => ({
        maxHeight: window.getComputedStyle(element).maxHeight,
        opacity: window.getComputedStyle(element).opacity,
      }),
    );
    expect(hiddenTranscriptState).toEqual({
      maxHeight: "0px",
      opacity: "0",
    });

    const roughdraftPopup = storyboard.locator(
      "[data-homepage-workflow-popup]",
    );
    await expect(roughdraftPopup).toHaveAttribute(
      "data-popup-visible",
      "false",
    );
    await expect(roughdraftPopup).toHaveAttribute("aria-hidden", "true");

    const hiddenPopupState = await roughdraftPopup.evaluate((element) => ({
      opacity: window.getComputedStyle(element).opacity,
      pointerEvents: window.getComputedStyle(element).pointerEvents,
    }));
    expect(hiddenPopupState).toEqual({
      opacity: "0",
      pointerEvents: "none",
    });

    await storyboard
      .locator("[data-homepage-workflow-scene]")
      .nth(1)
      .evaluate((element) => {
        window.scrollTo({
          top: element.getBoundingClientRect().top + window.scrollY - 1,
        });
      });
    await expect(agentWorkTranscript).toHaveAttribute(
      "data-agent-work-visible",
      "false",
    );

    await storyboard
      .locator("[data-homepage-workflow-scene]")
      .nth(1)
      .evaluate((element) => {
        window.scrollTo({
          top: element.getBoundingClientRect().top + window.scrollY,
        });
      });
    await expect(agentWorkTranscript).toHaveAttribute(
      "data-agent-work-visible",
      "true",
    );
    await expect(
      storyboard.getByText(
        "I'll inspect the current homepage, draft a Markdown plan, and open it in Roughdraft for review before I code.",
      ),
    ).toBeVisible();
    await expect(storyboard.getByText("Tool calls")).toBeVisible();
    await expect(roughdraftPopup).toHaveAttribute(
      "data-popup-visible",
      "false",
    );

    await storyboard
      .locator("[data-homepage-workflow-scene]")
      .nth(2)
      .evaluate((element) => {
        window.scrollTo({
          top: element.getBoundingClientRect().top + window.scrollY,
        });
      });
    await expect(roughdraftPopup).toHaveAttribute("data-popup-visible", "true");
    await expect(roughdraftPopup).not.toHaveAttribute("aria-hidden", "true");
    await expect(
      storyboard
        .getByRole("heading", { name: "Homepage Conversion Plan" })
        .first(),
    ).toBeVisible();
    await expect(
      storyboard.getByRole("button", { name: "Done Reviewing" }),
    ).toBeVisible();
    await expect(storyboard.getByText("Review complete")).toBeVisible();

    const stickyLayout = await storyboard.evaluate((element) => {
      const sticky = element.querySelector(
        "[data-homepage-workflow-sticky-visual]",
      );
      const sceneList = element.querySelector(".homepage-workflow-scene-list");
      if (!sticky || !sceneList) {
        throw new Error("Expected sticky visual and scene list");
      }

      const stickyRect = sticky.getBoundingClientRect();
      const sceneListRect = sceneList.getBoundingClientRect();
      return {
        position: window.getComputedStyle(sticky).position,
        sceneListRight: sceneListRect.right,
        stickyLeft: stickyRect.left,
        stickyTop: stickyRect.top,
      };
    });
    expect(stickyLayout.position).toBe("sticky");
    expect(stickyLayout.stickyLeft).toBeGreaterThan(
      stickyLayout.sceneListRight,
    );

    const sceneLayout = await storyboard
      .locator("[data-homepage-workflow-scene]")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            height: rect.height,
            top: rect.top + window.scrollY,
          };
        }),
      );
    expect(sceneLayout).toHaveLength(6);
    for (let index = 1; index < sceneLayout.length; index += 1) {
      expect(sceneLayout[index].top).toBeGreaterThan(
        sceneLayout[index - 1].top,
      );
    }
    for (const scene of sceneLayout) {
      expect(scene.height).toBeGreaterThan(500);
    }

    const storyboardTop = await storyboard.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
    const markdownTop = await page
      .locator(".rfm-format-demo")
      .evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      );
    expect(storyboardTop).toBeLessThan(markdownTop);

    await testInfo.attach("homepage-workflow-storyboard-desktop", {
      body: await storyboard.screenshot(),
      contentType: "image/png",
    });

    logE2eEvent("homepage.workflow-storyboard.desktop", {
      sceneLayout,
      stickyLayout,
      storyboardTop,
      markdownTop,
    });
  });

  test("does not create horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const storyboard = page.locator("[data-homepage-workflow-storyboard]");
    await expect(storyboard).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "How it works",
      }),
    ).toBeVisible();

    await expect(
      storyboard.getByText("Ask for a plan", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("The agent works normally", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("Roughdraft opens the plan", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("Leave comments and suggestions", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("Click Done Reviewing", { exact: true }),
    ).toBeVisible();
    await expect(
      storyboard.getByText("The agent resumes", { exact: true }),
    ).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      storyboardClientWidth:
        document.querySelector("[data-homepage-workflow-storyboard]")
          ?.clientWidth ?? 0,
      storyboardScrollWidth:
        document.querySelector("[data-homepage-workflow-storyboard]")
          ?.scrollWidth ?? 0,
      viewportWidth: window.innerWidth,
    }));

    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth,
    );
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth,
    );
    expect(dimensions.storyboardScrollWidth).toBeLessThanOrEqual(
      dimensions.storyboardClientWidth,
    );

    logE2eEvent("homepage.workflow-storyboard.mobile-overflow", dimensions);
  });
});
