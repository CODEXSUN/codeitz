import packageInfo from '../../package.json' with { type: 'json' };

// Web and Desktop display the owning application's build version.
export const appVersionLabel = `Codeitz - V${packageInfo.version}`;
