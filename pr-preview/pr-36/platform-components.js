const platformComponentCollator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
});
function platformComponentGroup([name, component]) {
    const group = typeof component?.group === 'string' ? component.group.trim() : '';
    return group || name;
}
export function sortPlatformScoreComponents(entries) {
    return entries.slice().sort((a, b) => {
        const groupDiff = platformComponentCollator.compare(platformComponentGroup(a), platformComponentGroup(b));
        if (groupDiff !== 0)
            return groupDiff;
        return platformComponentCollator.compare(a[0], b[0]);
    });
}
function commandArgument(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed))
        return null;
    return trimmed;
}
function quotePosixShellArgument(value) {
    if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value))
        return value;
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}
export function buildMetriqGymDispatchInstructions({ provider, device, suite, component, runtimeDeviceId, }) {
    const providerArgument = commandArgument(provider);
    const platformDevice = commandArgument(device);
    const suiteArgument = commandArgument(suite);
    const suiteComponent = commandArgument(component);
    if (!providerArgument || !platformDevice || !suiteArgument || !suiteComponent)
        return null;
    const isAws = ['aws', 'braket'].includes(providerArgument.toLocaleLowerCase('en-US'));
    const suppliedRuntimeDevice = runtimeDeviceId === undefined || runtimeDeviceId === null
        ? null
        : commandArgument(runtimeDeviceId);
    if (runtimeDeviceId !== undefined && runtimeDeviceId !== null && !suppliedRuntimeDevice)
        return null;
    const validAwsRuntimeDevice = isAws && suppliedRuntimeDevice && /^arn:[^:]+:braket:[^:]+:[^:]*:device\/.+$/i.test(suppliedRuntimeDevice)
        ? suppliedRuntimeDevice
        : null;
    const requiresRuntimeDeviceId = isAws && !validAwsRuntimeDevice;
    const deviceArgument = validAwsRuntimeDevice
        ?? (requiresRuntimeDeviceId ? `<full Braket ARN for ${platformDevice}>` : platformDevice);
    const command = [
        `mgym suite dispatch ${quotePosixShellArgument(suiteArgument)} \\`,
        `  --component ${quotePosixShellArgument(suiteComponent)} \\`,
        `  --provider ${quotePosixShellArgument(providerArgument)} \\`,
        `  --device ${quotePosixShellArgument(deviceArgument)}`,
    ].join('\n');
    return { command, suite: suiteArgument, suiteComponent, requiresRuntimeDeviceId };
}
