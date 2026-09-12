def target_snapshot(value):
    target = value["buildEvidence"]["target"]
    platform = {"linux": "linux", "win": "windows", "osx": "macos", "android": "android"}[target.split("-")[0]]
    unrelated = {"linux", "windows", "macos", "android"} - {platform}
    snapshot = dict(value)
    snapshot["outputs"] = {target: value["outputs"][target]}
    for section in ("build", "buildEvidence"):
        snapshot[section] = {key: item for key, item in value[section].items() if key not in unrelated}
        if "environments" in snapshot[section]:
            snapshot[section]["environments"] = {target: value[section]["environments"][target]}
    policy = snapshot["build"]
    snapshot["buildEvidence"] = {
        key: item for key, item in snapshot["buildEvidence"].items()
        if key not in policy or item != policy[key]
    }
    return snapshot
