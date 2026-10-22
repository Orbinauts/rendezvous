import { gh } from "./github.ts";

/**
 * The scheduled workflow's keep-alive: `npm run live:keep-alive`. GitHub
 * disables a public repository's scheduled workflows after sixty days
 * with no activity in it, and the live run is meant to run for years.
 * Each scheduled run ends by listing the repository's workflows and
 * enabling again any that GitHub disabled for inactivity
 * (`disabled_inactivity`). A workflow a person disabled
 * (`disabled_manually`) is never touched: pausing one stays a person's
 * call. Every scheduled workflow disabled at once cannot enable another;
 * `gh workflow list --all` shows it, and `gh workflow enable <file>` ends
 * it. Copied from Orbinauts/breakups (scripts/maintenance/keep-alive.ts).
 */

/** A workflow as GitHub's REST API lists it. */
export interface WorkflowState {
  id: number;
  name: string;
  path: string;
  state: string;
}

/** The workflows to enable again: those GitHub disabled for the repository's inactivity, and no other. */
export function toReenable(workflows: readonly WorkflowState[]): WorkflowState[] {
  return workflows.filter((workflow) => workflow.state === "disabled_inactivity");
}

function main(): void {
  const workflows = JSON.parse(gh(["api", "--paginate", "--slurp", "repos/{owner}/{repo}/actions/workflows"])) as { workflows: WorkflowState[] }[];
  const listed = workflows.flatMap((page) => page.workflows);
  for (const workflow of toReenable(listed)) {
    gh(["api", "-X", "PUT", `repos/{owner}/{repo}/actions/workflows/${workflow.id}/enable`]);
    console.log(`${workflow.path}: GitHub had disabled it for the repository's inactivity; enabled again`);
  }
  console.log(`${listed.length} workflows: ${listed.map((workflow) => `${workflow.path.replace(".github/workflows/", "")} ${workflow.state}`).join(", ")}`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("keep-alive.ts")) main();
