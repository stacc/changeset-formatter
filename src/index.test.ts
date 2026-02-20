import { describe, it, expect, vi, beforeEach } from "vitest";
import changelogFunctions from "./index";
import parse from "@changesets/parse";

const getReleaseLine = changelogFunctions.getReleaseLine;

// Mock @changesets/get-github-info
vi.mock("@changesets/get-github-info", () => {
  // Mock data
  const data = {
    commit: "a085003",
    user: "Gawdfrey",
    pull: 1613,
    repo: "stacc/changeset-formatter",
  };
  const links = {
    user: `[@${data.user}](https://github.com/${data.user})`,
    pull: `[#${data.pull}](https://github.com/${data.repo}/pull/${data.pull})`,
    commit: `[\`${data.commit}\`](https://github.com/${data.repo}/commit/${data.commit})`,
  };

  const getInfoFn = vi.fn(async ({ commit, repo }) => {
    expect(repo).toBe(data.repo);
    if (commit === data.commit) {
      return {
        pull: data.pull,
        user: data.user,
        links: {
          user: links.user,
          commit: links.commit,
          pull: links.pull,
        },
      };
    }
    return {
      pull: data.pull,
      user: data.user,
      links: {
        user: links.user,
        commit: `[\`${commit}\`](https://github.com/${repo}/commit/${commit})`,
        pull: links.pull,
      },
    };
  });

  const getInfoFromPullRequestFn = vi.fn(async ({ pull, repo }) => {
    expect(repo).toBe(data.repo);
    if (pull === data.pull) {
      return {
        commit: data.commit,
        user: data.user,
        links: {
          user: links.user,
          commit: links.commit,
          pull: links.pull,
        },
      };
    }
    throw new Error(`Unexpected pull request: ${pull}`);
  });

  return {
    getInfo: getInfoFn,
    getInfoFromPullRequest: getInfoFromPullRequestFn,
  };
});

const data = {
  commit: "a085003",
  user: "Gawdfrey",
  pull: 1613,
  repo: "stacc/changeset-formatter",
};

// Helper to create a changeset for testing
const getChangeset = (
  content: string,
  commit: string | undefined,
  isLast = false,
  summary?: string,
  extraOptions?: Record<string, any>
) => {
  return [
    {
      ...parse(
        `---
  pkg: "minor"
  ---

  ${summary || "something"}
  ${content}
  `
      ),
      id: "some-id",
      commit,
    },
    "minor",
    { repo: data.repo, isLast, ...extraOptions },
  ] as const;
};

describe("Changeset formatter", () => {
  describe.each([data.commit, "wrongcommit", undefined])(
    "with commit from changeset of %s",
    (commitFromChangeset) => {
      describe.each(["pr", "pull request", "pull"])(
        "override pr with %s keyword",
        (keyword) => {
          it.each([
            ["with #", `${keyword}: #${data.pull}`],
            ["without #", `${keyword}: ${data.pull}`],
          ])("%s", async (name, content) => {
            const result = await getReleaseLine(
              ...getChangeset(
                content,
                commitFromChangeset as string | undefined,
                true
              )
            );
            expect(result).toEqual(
              `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
            );
          });
        }
      );

      it("override commit with commit keyword", async () => {
        const result = await getReleaseLine(
          ...getChangeset(
            `commit: ${data.commit}`,
            commitFromChangeset as string | undefined,
            true
          )
        );
        expect(result).toEqual(
          `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
        );
      });
    }
  );

  describe("ticket references", () => {
    it("should append full URL ticket as link", async () => {
      const result = await getReleaseLine(
        ...getChangeset(
          "ticket: https://stacc-as.atlassian.net/browse/PRO-142",
          data.commit,
          true,
        )
      );
      expect(result).toEqual(
        `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}) | [PRO-142](https://stacc-as.atlassian.net/browse/PRO-142))`
      );
    });

    it("should support multiple ticket URLs", async () => {
      const result = await getReleaseLine(
        ...getChangeset(
          "ticket: https://stacc-as.atlassian.net/browse/PRO-142\nticket: https://github.com/stacc/mortgage/issues/99",
          data.commit,
          true,
        )
      );
      expect(result).toEqual(
        `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}) | [PRO-142](https://stacc-as.atlassian.net/browse/PRO-142) | [99](https://github.com/stacc/mortgage/issues/99))`
      );
    });

    it("should ignore non-URL ticket values", async () => {
      const result = await getReleaseLine(
        ...getChangeset(
          "ticket: PRO-142",
          data.commit,
          true,
        )
      );
      expect(result).toEqual(
        `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );
    });
  });

  describe.skip("multiple changes", () => {
    it("should only show credits after last change", async () => {
      // First change
      const firstResult = await getReleaseLine(
        ...getChangeset("", data.commit, false, "first change")
      );
      expect(firstResult).toEqual(
        `- first change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );

      // Second change
      const secondResult = await getReleaseLine(
        ...getChangeset("", data.commit, false, "second change")
      );
      expect(secondResult).toEqual(
        `- second change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );

      // Last change
      const lastResult = await getReleaseLine(
        ...getChangeset("", data.commit, true, "third change")
      );
      expect(lastResult).toEqual(
        `- third change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\n**Credits**\nHuge thanks to @Gawdfrey for helping!`
      );
    });

    it("should combine authors from all changes", async () => {
      // First change with GitHub author
      const firstResult = await getReleaseLine(
        ...getChangeset("", data.commit, false, "first change")
      );
      expect(firstResult).toEqual(
        `- first change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );

      // Second change with explicit author
      const secondResult = await getReleaseLine(
        ...getChangeset("", data.commit, false, "second change")
      );
      expect(secondResult).toEqual(
        `- second change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );

      // Last change with multiple authors
      const lastResult = await getReleaseLine(
        ...getChangeset("", data.commit, true, "third change")
      );
      expect(lastResult).toEqual(
        `- third change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\n**Credits**\nHuge thanks to @Gawdfrey for helping!`
      );
    });
  });
});
