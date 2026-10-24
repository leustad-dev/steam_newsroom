# Steam Newsroom

Keep up with your games, even when they are not installed.

Steam Newsroom is a plugin for desktop Steam, powered by [Millennium](https://steambrew.app/). It brings recent developer announcements and updates from your library into one place, with Favorites for games you want to follow and an Ignore list for games you do not.

**Version 0.9.1 is a beta tested on Fedora Linux. Windows support has not been verified.** This is an independent community project, not affiliated with Valve or endorsed by SteamBrew.

## Features

- **News & Updates:** browse developer posts published in the last seven days, grouped by game. Includes owned games that are uninstalled or have never been played.
- **Library:** browse your owned base games and open their news history, including games without recent posts.
- **Favorites:** follow owned or unowned Steam games. Type a name to see suggestions, then select a game to add it. Favorites remain visible even without recent news.
- **Ignored games:** hide games from browsing and search suggestions, and stop checking their news. Unignore them to resume checking. Favorited games cannot be ignored until you remove the favorite.
- **Game history:** choose the last week, month, three months, or all history Steam makes available. This setting does not change the seven-day main feed.
- **Readable posts:** view formatted text, images, supported videos and YouTube previews, or open the original post.
- **Search and sorting:** find games by name and sort by name, playtime or newest news.
- **Automatic refresh:** news refreshes every 15 minutes while Steam is running, with a visible countdown. Saved library news, Favorites and Ignore preferences survive restarts.

## Requirements

- Desktop Steam with [Millennium installed](https://steambrew.app/).
- An internet connection to retrieve news and search for games.

Installing the downloaded plugin does not require Node.js, npm, Python, a Steam Web API key or your Steam password.

## Install on Fedora / Linux

1. Open this repository's **Releases** page and download the attached **`steam-newsroom.star`** file. The automatically generated source-code ZIP is not the installable plugin.
2. Fully quit Steam, including its background process.
3. Copy the downloaded file into Millennium's plugins directory. If it is in your Downloads folder:

   ```sh
   newsroom_plugin_dir="${XDG_DATA_HOME:-$HOME/.local/share}/millennium/plugins"
   mkdir -p "$newsroom_plugin_dir"
   cp "$HOME/Downloads/steam-newsroom.star" "$newsroom_plugin_dir/steam-newsroom.star"
   ```

   Adjust the download path if you saved the file elsewhere. With the default Linux configuration, the destination is `~/.local/share/millennium/plugins/steam-newsroom.star`.

4. Reopen Steam and enable **Steam Newsroom** under **Steam → Millennium → Plugins**.
5. Click the **Steam Newsroom** button near the bottom-right of Steam's Library view.

The first news scan loads progressively. Some games may take longer to check; failed checks are shown separately from games with no recent news.

## Using Steam Newsroom

- Click a game's artwork to open its history. Click a headline to open the game with that post expanded.
- Click the star on a Library or News & Updates card to add a favorite. Click the lit star again to remove it, or use the red minus in Favorites.
- Use **Ignore** at the upper-left of a card to hide a non-favorite. The **Ignored** tab lists names with an **Unignore** action; unignoring automatically queues a fresh news check.
- Use **Refresh** for a manual update. The **⋯** menu contains library refresh, saved-news clearing and a return to Steam Library.
- **Clear saved news** leaves Favorites and Ignore preferences intact.

## Update or uninstall

To update, fully quit Steam, replace the existing `.star` file with the new release, then reopen Steam. Replacing the plugin file keeps your saved preferences.

To uninstall, fully quit Steam and remove `steam-newsroom.star` from Millennium's plugins directory. This removes the plugin; its saved settings and news cache may remain in Millennium's configuration directory.

## Current limitations

- This beta has been tested on Fedora Linux. Windows and other desktop environments remain unverified; Steam Deck support is outside the current scope.
- News coverage and available history depend on what Steam supplies. This is not a guarantee that every game update will have a corresponding announcement.
- Borrowed/family-shared games, tools, demos, DLC and non-Steam shortcuts are excluded from the owned Library. Favorites accepts Steam base games.
- Unread tracking, news categorization and automatic detection of games leaving Early Access are not implemented. Release announcements may appear in the feed, but are not classified as confirmed graduations.
- The plugin does not monitor news while Steam is closed. Unowned Favorites keep their saved membership, but their weekly news is fetched again after a complete restart.
- Steam or Millennium updates may affect compatibility.

## Feedback

Use the [issue forms](https://github.com/leustad-dev/steam_newsroom/issues/new/choose) to report a bug or suggest a feature. Include the plugin version, operating system, Steam/Millennium versions, what you expected and what happened. For news-formatting issues, include the game and post title or public post link. Remove account details or other personal information from screenshots and logs before sharing them.

## Build from source

For contributors, install Node.js/npm and run these commands from the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run inspect
```

The bundle is written to `dist/steam-newsroom.star`. LuaJIT is needed to run the Lua backend/storage contract tests; without it, those cases are skipped. Millennium provides the runtime when the plugin is installed.

## Author and AI assistance

Created and maintained by **Leustad**. This project was developed with substantial AI assistance, including AI-generated code and documentation, guided by the maintainer's requirements and testing.

## License

[MIT](LICENSE). You may use, modify and redistribute the project, including commercially, while retaining the copyright and license notice. It is provided without warranty. Third-party dependencies and game artwork retain their respective licenses and rights.
