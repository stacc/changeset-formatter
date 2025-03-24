import { getInfo, getInfoFromPullRequest } from "@changesets/get-github-info";
import {
  ChangelogFunctions,
  ModCompWithPackage,
  NewChangesetWithCommit,
} from "@changesets/types";

// Add PR property to NewChangesetWithCommit
interface ChangesetWithPR extends NewChangesetWithCommit {
  PR?: number;
}

// Keep track of all authors across changesets
let allAuthors = new Set<string>();
let patchChanges = new Set<string>();

// Reset function to be called at the start of each changelog generation
function resetChangelogState() {
  allAuthors.clear();
  patchChanges.clear();
}

async function getReleaseLine(
  changeset: ChangesetWithPR,
  type: string,
  options: Record<string, any> | null
) {
  if (!options || !options.repo) {
    throw new Error(
      'Please provide a repo to this changelog generator like this:\n"changelog": ["./changelog-format.js", { "repo": "org/repo" }]'
    );
  }

  const repo: string = options.repo;

  // Extract PR, commit, and users from the summary
  let prFromSummary: number | undefined;
  let commitFromSummary: string | undefined;

  // Process the changeset summary to extract metadata
  const replacedChangelog = changeset.summary
    .replace(/^\s*(?:pr|pull|pull\s+request):\s*#?(\d+)/im, (_, pr) => {
      let num = Number(pr);
      if (!isNaN(num)) prFromSummary = num;
      return "";
    })
    .replace(/^\s*commit:\s*([^\s]+)/im, (_, commit) => {
      commitFromSummary = commit;
      return "";
    })
    .trim();

  // Format the cleaned summary
  const [firstLine, ...futureLines] = replacedChangelog
    .split("\n")
    .map((line) => line.trimRight());

  // Get GitHub information for the PR or commit
  const githubInfo = await (async () => {
    try {
      if (prFromSummary !== undefined) {
        const { links, user } = await getInfoFromPullRequest({
          repo,
          pull: prFromSummary,
        });
        console.log(`[Debug] Pull request info: ${user}`);
        if (user) {
          allAuthors.add(user);
        }
        return { links, user };
      }

      // Use commit from summary or from changeset
      const commitToFetchFrom = commitFromSummary || changeset.commit;
      if (commitToFetchFrom) {
        const info = await getInfo({
          repo,
          commit: commitToFetchFrom,
        });
        console.log(`[Debug] Commit info: ${info.user}`);
        if (info.user) {
          allAuthors.add(info.user);
        }
        return info;
      }

      return { links: { commit: null, pull: null }, user: null };
    } catch (error) {
      const err = error as Error;
      console.warn(`Error getting GitHub info: ${err.message}`);
      return { links: { commit: null, pull: null }, user: null };
    }
  })();

  // Get PR number for the change
  const prNumber =
    prFromSummary ||
    changeset.PR ||
    (githubInfo.links?.pull
      ? githubInfo.links.pull.match(/#(\d+)/)?.[1]
      : undefined);

  // Build the release line in the requested format
  let result = `- ${firstLine}`;

  if (prNumber) {
    result += ` ([#${prNumber}](https://github.com/${repo}/pull/${prNumber}))`;
  } else if (githubInfo.links?.commit) {
    result += ` (${githubInfo.links.commit})`;
  }

  if (futureLines.length > 0) {
    result += "\n" + futureLines.map((line) => "  " + line).join("\n");
  }

  return result;
}

async function getDependencyReleaseLine(
  changesets: NewChangesetWithCommit[],
  dependenciesUpdated: ModCompWithPackage[],
  options: Record<string, any> | null
) {
  if (!options || !options.repo) {
    throw new Error(
      'Please provide a repo to this changelog generator like this:\n"changelog": ["./changelog-format.js", { "repo": "org/repo" }]'
    );
  }

  const repo: string = options.repo;

  if (dependenciesUpdated.length === 0) return "";

  // Get commit links for all changesets
  const changesetLinks = await Promise.all(
    changesets.map(async (cs) => {
      if (cs.commit) {
        try {
          const { links, user } = await getInfo({
            repo,
            commit: cs.commit,
          });
          console.log(`[Debug] Commit info: ${user}`);
          if (user) {
            allAuthors.add(user);
          }
          return links.commit;
        } catch (error) {
          const err = error as Error;
          console.warn(`Error getting commit info: ${err.message}`);
          return null;
        }
      }
      return null;
    })
  );

  // Filter out null links
  const filteredLinks = changesetLinks.filter(Boolean);

  // Create the dependency update line
  const changesetLink =
    filteredLinks.length > 0
      ? `Updated dependencies [${filteredLinks.join(", ")}]:`
      : "Updated dependencies:";

  // List updated dependencies
  const updatedDependenciesList = dependenciesUpdated.map(
    (dependency) => `  - ${dependency.name}@${dependency.newVersion}`
  );

  return [changesetLink, ...updatedDependenciesList].join("\n");
}

// Function to get the credits section
function getCreditsSection(): string {
  const authors = Array.from(allAuthors).sort();
  console.log(`[Debug] Authors: ${authors}`);
  const authorLinks = authors.map((author) => `@${author}`);

  if (authorLinks.length === 0) {
    return "";
  }

  let credits = "\n\n**Credits**\n";
  if (authorLinks.length === 1) {
    credits += `Huge thanks to ${authorLinks[0]} for helping!`;
  } else if (authorLinks.length === 2) {
    credits += `Huge thanks to ${authorLinks[0]} and ${authorLinks[1]} for helping!`;
  } else {
    const lastAuthor = authorLinks.pop()!;
    credits += `Huge thanks to ${authorLinks.join(
      ", "
    )}, and ${lastAuthor} for helping!`;
  }

  return credits;
}

// Adapter functions to match the ChangelogFunctions type
const wrappedGetReleaseLine: ChangelogFunctions["getReleaseLine"] = async (
  changeset,
  type,
  opts
) => {
  const result = await getReleaseLine(changeset as ChangesetWithPR, type, opts);

  // Track patch changes
  if (type === "patch") {
    patchChanges.add(changeset.summary);
  }

  return result;
};

const wrappedGetDependencyReleaseLine: ChangelogFunctions["getDependencyReleaseLine"] =
  async (changesets, dependencies, opts) => {
    const result = await getDependencyReleaseLine(
      changesets,
      dependencies,
      opts
    );

    console.log(`[Debug] Authors: ${allAuthors}`);
    // Add credits section if we have authors
    if (allAuthors.size > 0) {
      const credits = getCreditsSection();
      // Reset state after adding credits
      resetChangelogState();
      return result + credits;
    }
    return result;
  };

const defaultChangelogFunctions: ChangelogFunctions = {
  getReleaseLine: wrappedGetReleaseLine,
  getDependencyReleaseLine: wrappedGetDependencyReleaseLine,
};

export default defaultChangelogFunctions;
