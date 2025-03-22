# Changeset Formatter

A custom formatter for [changesets](https://github.com/changesets/changesets) that provides a cleaner changelog format.

## Installation

This package is published to GitHub Packages. To install it, you'll need to authenticate with GitHub Packages:

```bash
# Create or edit .npmrc file in your project root or user home
echo "@stacc:registry=https://npm.pkg.github.com" >> .npmrc
```

Then you can install the package:

```bash
npm install @stacc/changeset-formatter
# or
pnpm add @stacc/changeset-formatter
# or
yarn add @stacc/changeset-formatter
```

## Usage

In your `.changeset/config.json` file, set the formatter:

```json
{
  "changelog": ["@stacc/changeset-formatter", { "repo": "stacc/repo-name" }],
  "commit": false,
  "access": "restricted",
  "baseBranch": "main"
}
```

## Format

This formatter provides a simple bullet-point format:

```
- Main summary line
  Additional context on second line
  More details if needed
- Another change with one line only
```

## Development

### Creating a changeset

To create a new changeset:

```bash
pnpm changeset
```

This will guide you through the process of creating a changeset that describes your changes.

### Testing locally

To test the formatter locally without publishing:

1. Build the formatter:

   ```bash
   pnpm run build
   ```

2. In your `.changeset/config.json`, use a local path:

   ```json
   {
     "changelog": ["./dist/index.js", { "repo": "stacc/changeset-formatter" }]
   }
   ```

3. Run version or publish commands to see the generated changelog:
   ```bash
   pnpm changeset version
   ```

### Using in GitHub Actions

The GitHub workflow is configured to:

1. Build the formatter first, making it available for the changesets action
2. Use the local build for generating changelogs
3. Publish the package when approved

### Publishing

The package is automatically published through GitHub Actions when changesets are merged into the main branch.

## License

ISC
