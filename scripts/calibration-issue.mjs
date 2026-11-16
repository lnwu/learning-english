import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  CALIBRATION_ISSUE_LABEL,
  planCalibrationIssue,
} from "../apps/web/src/lib/calibrationIssue.ts";
import { CALIBRATION_MIN_SAMPLES } from "../apps/web/src/lib/calibrationMetrics.ts";
import { createArgs } from "./lib/args.mjs";

const { takeFlag, hasFlag, positional } = createArgs(process.argv.slice(2));
const dryRun = hasFlag("dry-run");
const runUrl = takeFlag("run-url") || null;
const cooldownRaw = takeFlag("cooldown-days");
const issuesFile = takeFlag("issues-file") || null;
const input = positional()[0] ?? "calibration-out/report.json";

const describePlan = (plan) => {
  switch (plan.action) {
    case "skip-below-threshold":
      return `[issue] 可校准样本 ${plan.samples} 未达门槛（${CALIBRATION_MIN_SAMPLES}），跳过`;
    case "skip-cooldown":
      return `[issue] 校准 Issue #${plan.number} 仍在冷却期，剩余 ${plan.daysLeft} 天（重开时间 ${new Date(plan.reopenAt).toISOString()}），跳过`;
    case "update":
      return `[issue] update #${plan.number}`;
    case "create":
      return "[issue] create";
  }
};

const run = () => {
  const report = JSON.parse(readFileSync(input, "utf8"));
  const issues = issuesFile
    ? JSON.parse(readFileSync(issuesFile, "utf8"))
    : JSON.parse(
        execFileSync(
          "gh",
          [
            "issue",
            "list",
            "--label",
            CALIBRATION_ISSUE_LABEL,
            "--state",
            "all",
            "--limit",
            "100",
            "--json",
            "number,state,closedAt",
          ],
          { encoding: "utf8" },
        ),
      );

  let cooldownDays;
  if (cooldownRaw !== undefined) {
    cooldownDays = Number(cooldownRaw);
    if (!Number.isFinite(cooldownDays) || cooldownDays < 0) {
      throw new Error(`无效的 --cooldown-days：${cooldownRaw}`);
    }
  }

  const plan = planCalibrationIssue({
    report,
    issues,
    now: Date.now(),
    runUrl,
    cooldownDays,
  });

  console.log(describePlan(plan));
  if ("title" in plan) {
    console.log(`标题：${plan.title}`);
    console.log(plan.body);
  }

  if (dryRun || plan.action === "skip-below-threshold" || plan.action === "skip-cooldown") return;

  const execOptions = { input: plan.body, stdio: ["pipe", "inherit", "inherit"] };

  if (plan.action === "create") {
    execFileSync(
      "gh",
      [
        "label",
        "create",
        CALIBRATION_ISSUE_LABEL,
        "--description",
        "熟练度校准提醒",
        "--color",
        "1D76DB",
        "--force",
      ],
      { stdio: "inherit" },
    );
    execFileSync(
      "gh",
      [
        "issue",
        "create",
        "--title",
        plan.title,
        "--label",
        CALIBRATION_ISSUE_LABEL,
        "--body-file",
        "-",
      ],
      execOptions,
    );
    console.log("[issue] 已创建校准提醒 Issue");
    return;
  }

  execFileSync(
    "gh",
    ["issue", "edit", String(plan.number), "--title", plan.title, "--body-file", "-"],
    execOptions,
  );
  console.log(`[issue] 已更新校准 Issue #${plan.number}`);
};

try {
  run();
} catch (error) {
  console.error(`[issue] 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
