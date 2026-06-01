const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Avoid Metro crashes when temp Gradle / autolinking folders disappear mid-watch.
config.resolver.blockList = [
  ...(config.resolver.blockList ?? []),
  /[/\\]\.gradle[/\\].*/,
  /[/\\]node_modules[/\\]\.expo-modules-autolinking-[^/\\]+[/\\].*/,
];

module.exports = config;
