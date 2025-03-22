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
  let usersFromSummary: string[] = [];
  let hasAuthorOverride = false;

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
    .replace(
      /^\s*(?:author|user):\s*@?([^\s,]+)(?:\s*,\s*@?([^\s,]+))*/gim,
      (_, user, rest) => {
        hasAuthorOverride = true;
        if (user && !usersFromSummary.includes(user)) {
          usersFromSummary.push(user);
          allAuthors.add(user);
        }
        if (rest && !usersFromSummary.includes(rest)) {
          usersFromSummary.push(rest);
          allAuthors.add(rest);
        }
        return "";
      }
    )
    .replace(/^\s*(?:author|user):\s*@?([^\s,]+)/gim, (_, user) => {
      hasAuthorOverride = true;
      if (user && !usersFromSummary.includes(user)) {
        usersFromSummary.push(user);
        allAuthors.add(user);
      }
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
        if (user && !hasAuthorOverride) {
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
        if (info.user && !hasAuthorOverride) {
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

  // Get commit hash for the change
  const commitHash = commitFromSummary || changeset.commit;

  // Build the release line in the requested format
  let result = `- ${firstLine}`;

  if (prNumber) {
    result += ` ([#${prNumber}](https://github.com/${repo}/pull/${prNumber}))`;
  } else if (commitHash) {
    result += ` ([\`${commitHash}\`](https://github.com/${repo}/commit/${commitHash}))`;
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
  if (allAuthors.size === 0) return "";

  const authors = Array.from(allAuthors).sort();
  const authorLinks = authors.map((author) => `@${author}`);

  if (authorLinks.length === 0) return "";

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

  // Clear the authors set for the next changelog
  allAuthors.clear();

  return credits;
}

// Adapter functions to match the ChangelogFunctions type
const wrappedGetReleaseLine: ChangelogFunctions["getReleaseLine"] = async (
  changeset,
  type,
  opts
) => {
  const result = await getReleaseLine(changeset as ChangesetWithPR, type, opts);
  // Only add credits section if this is the last changeset
  if (opts?.isLast) {
    return result + getCreditsSection();
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
    // Only add credits section if this is the last entry and there are no regular changesets
    if (opts?.isLast && changesets.length === 0) {
      return result + getCreditsSection();
    }
    return result;
  };

const defaultChangelogFunctions: ChangelogFunctions = {
  getReleaseLine: wrappedGetReleaseLine,
  getDependencyReleaseLine: wrappedGetDependencyReleaseLine,
};

export default defaultChangelogFunctions;
