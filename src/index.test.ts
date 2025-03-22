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
  return {
    getInfo: vi.fn(async ({ commit, repo }) => {
      expect(commit).toBe(data.commit);
      expect(repo).toBe(data.repo);
      return {
        pull: data.pull,
        user: data.user,
        links,
      };
    }),
    getInfoFromPullRequest: vi.fn(async ({ pull, repo }) => {
      expect(pull).toBe(data.pull);
      expect(repo).toBe(data.repo);
      return {
        commit: data.commit,
        user: data.user,
        links,
      };
    }),
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
  summary?: string
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
    { repo: data.repo, isLast },
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
              `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\nCredits\nHuge thanks to @Gawdfrey for helping!`
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
          `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\nCredits\nHuge thanks to @Gawdfrey for helping!`
        );
      });
    }
  );

  describe.each(["author", "user"])(
    "override author with %s keyword",
    (keyword) => {
      it.each([
        ["with @", `${keyword}: @other`],
        ["without @", `${keyword}: other`],
      ])("%s", async (name, content) => {
        const result = await getReleaseLine(
          ...getChangeset(content, data.commit, true)
        );
        expect(result).toEqual(
          `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\nCredits\nHuge thanks to @other for helping!`
        );
      });
    }
  );

  it("with multiple authors", async () => {
    const result = await getReleaseLine(
      ...getChangeset(
        ["author: @Gawdfrey", "author: @thymas1"].join("\n"),
        data.commit,
        true
      )
    );

    expect(result).toEqual(
      `- something ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\nCredits\nHuge thanks to @Gawdfrey and @thymas1 for helping!`
    );
  });

  describe("multiple changes", () => {
    it("should only show credits after last change", async () => {
      // First change
      const firstResult = await getReleaseLine(
        ...getChangeset("author: @Gawdfrey", data.commit, false, "first change")
      );
      expect(firstResult).toEqual(
        `- first change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );

      // Second change
      const secondResult = await getReleaseLine(
        ...getChangeset("author: @thymas1", data.commit, false, "second change")
      );
      expect(secondResult).toEqual(
        `- second change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );

      // Last change
      const lastResult = await getReleaseLine(
        ...getChangeset("author: @huozhi", data.commit, true, "third change")
      );
      expect(lastResult).toEqual(
        `- third change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\nCredits\nHuge thanks to @Gawdfrey, @huozhi, and @thymas1 for helping!`
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
        ...getChangeset("author: @thymas1", data.commit, false, "second change")
      );
      expect(secondResult).toEqual(
        `- second change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))`
      );

      // Last change with multiple authors
      const lastResult = await getReleaseLine(
        ...getChangeset(
          ["author: @huozhi", "author: @ijjk"].join("\n"),
          data.commit,
          true,
          "third change"
        )
      );
      expect(lastResult).toEqual(
        `- third change ([#${data.pull}](https://github.com/${data.repo}/pull/${data.pull}))\n\nCredits\nHuge thanks to @Gawdfrey, @huozhi, @ijjk, and @thymas1 for helping!`
      );
    });
  });
});
