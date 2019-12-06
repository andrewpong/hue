"use strict";

// Hope this works!
function uuid() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// Sleeping 11PM-7AM, Waking 7AM-8AM, Working 8AM-4PM, Relaxing 4PM-11PM

// A power managed zone is:
// 0. Config: Low power after period A
// 0. Config: Turn off after further period B
// 1. A ClipGenericStatus sensor that represents on(2)/lowpower(1)/off(0)
// 2. A rule: status == on(2) and lastupdate ddx A, change status to lowpower(1)
// 3. A rule: status == lowpower(1) and status ddx B, change status to off(0)
// 4. A ClipGenericFlag sensor to represent enabled state of power management
// Keep light in current state and ignore timer by setting flag to false
// Turn light on (or keep it on & reset timer) by setting status to on(2)
// Go to power saving (but not reset timer if already power-saving) by setting status to lowpower(1)
// Turn light off by setting status to off(0)
// For changes:
// A rule: status == on(2) to change light state
// A rule: status == lowpower(1) to change light state
// A rule: status == off(0) to change light state

// Low power state is useful as a visual aid even if only interested in turning off because it gives users a chance to boost power again.

// To use with a motion sensor or switch:
// A. Motion or switch turns zone on, zone turns itself off
// B. Switch can also turn zone to lowpower or off

// To use with motion sensor & override switch:
// A. Motion turns zone on
// B. Switch turns zone on and disables power management
// C. Switch turns zone off and enables power management

// How to deal with different timeouts like 1 min day & 5 mins night?

// A shared resource is:
// 1. A ClipGenericStatus sensor which represents the number of users
// 2. A ClipGenericFlag sensor that can be used to trigger an increment of the user count
// 3. A ClipGenericFlag sensor that can be used to trigger a  decrement of the user count
// 4. N rules that increment/decrement the user count in response to the triggers (where N is the maximum number of users).
// 5. N ClipGenericFlag sensors: one for each potential user indicating whether they are using the resource or not
// 6. 2N rules that fire the triggers to update the user count on the shared resource (2 rules for each user sensor: one to increment the shared count, one to decrement it)
// 7. A ClipGenericFlag sensor that can be used as an override to switch all the user sensors off or on

// There are so many rules because the Hue hub does not have an action for incrementing or decrementing an integer. The triggers are here so that the rules only need to be implemented once (and not once for each user; with the triggers we have N + 2N rules; without the triggers we'd have 2N^2 rules; if increment was implemented natively, we'd have 2N rules)

// An example of a shared resource is lighting in a hallway
// You want the lights in the hallway to remain on while there is anyone using or intending to use the hallway and you want the lights to turn off when there's no one using it
// You achieve this by removing the ability to directly turn on and turn off lights in the hallway from users and instead give them the ability to say that they are using or not using the hallway. Rules turn on the lights when the hallway is in use and turn off the lights when it's no longer in use.
// This gets rid of any confusion around motion detection and multiple users
// The motion detector is just another user who can let the hallway know it's being used, but is not responsible for turning lights off

async function create(method, address, body) {
    var json;
    try {
        const result = await fetch(address, { method, body });
        json = await result.json();
    } catch (e) {
        console.log(body);
        console.log(e);
        throw { body, e };
    }

    if (Array.isArray(json) && (json.length === 1) && json[0].success) {
        return json[0].success.id;
    }

    console.log(body);
    console.log(json);
    throw { body, json };
}

async function createSensor(connection, body) {
    const address = `https://${connection.hub}/api/${connection.app}/sensors`;
    const method = "POST";

    return create(method, address, body);
}

async function createRule(connection, body) {
    const address = `https://${connection.hub}/api/${connection.app}/rules`;
    const method = "POST";

    return create(method, address, body);
}

async function createResourceLink(connection, body) {
    const address = `https://${connection.hub}/api/${connection.app}/resourcelinks`;
    const method = "POST";

    return create(method, address, body);
}

async function deleteRule(connection, id) {
    const address = `https://${connection.hub}/api/${connection.app}/rules/${id}`;
    const method = "DELETE";
    return fetch(address, { method })
}

async function deleteSensor(connection, id) {
    const address = `https://${connection.hub}/api/${connection.app}/sensors/${id}`;
    const method = "DELETE";
    return fetch(address, { method })
}


async function getCategory(connection, category) {
    const address = `https://${connection.hub}/api/${connection.app}/${category}`;

    var json;
    try {
        const result = await fetch(address);
        json = await result.json();
    } catch (e) {
        console.log(e);
        throw { body, e };
    }

    return json;
}

async function getAllCategories(connection) {
    return getCategory(connection, "");
}

async function getRules(connection) {
    return getCategory(connection, "rules");
}

async function getSensors(connection) {
    return getCategory(connection, "sensors");
}

async function getLights(connection) {
    return getCategory(connection, "lights");
}

async function touchlink(connection) {
    const address = `https://${connection.hub}/api/${connection.app}/config/`;
    const body = `{"touchlink": true}`;
    const method = "PUT";
    var json;
    try {
        const result = await fetch(address, { method, body });
        json = await result.json();
    } catch (e) {
        console.log(body);
        console.log(e);
        throw { body, e };
    }

    if (Array.isArray(json) && (json.length === 1) && json[0].success) {
        return json;
    }

    console.log(body);
    console.log(json);
    throw { body, json };
}

async function deleteAppRules(connection) {
    const rules = await getRules(connection);

    for (const ruleID in rules) {
        const rule = rules[ruleID];
        if (rule.owner === connection.app) {
            await deleteRule(connection, ruleID);
        }
    }
}

async function deleteManufacturerSensors(connection, manufacturer) {
    const sensors = await getSensors(connection);

    for (const sensorID in sensors) {
        const sensor = sensors[sensorID];
        if (sensor.manufacturername === manufacturer) {
            await deleteSensor(connection, sensorID);
        }
    }
}

async function deleteAppSensors(connection) {
    return deleteManufacturerSensors(connection, connection.app);
}

async function registerApp(hub, appName, user) {
    user = user || "";
    const address = `https://${hub}/api/`;
    const body = `{"devicetype": "${appName}#${user}"}`;
    const method = "POST";
    let json;
    try {
        const result = await fetch(address, { method, body });
        json = await result.json();
    } catch (e) {
        console.log(body);
        console.log(e);
        throw { body, e };
    }

    if (Array.isArray(json) && (json.length === 1) && json[0].success) {
        return { hub, app: json[0].success.username };
    }

    console.log(body);
    console.log(json);
    throw { body, json };
}

async function connect(hub, appName) {
    const key = "hue-connection";
    const json = localStorage.getItem(key);
    var connection;
    if (json) {
        connection = JSON.parse(json);
        if (connection && connection.hub === hub) {
            return connection;
        }
    }

    connection = await registerApp(hub, appName);

    localStorage.setItem(key, JSON.stringify(connection));

    return connection;
}

// =============================


async function createUserCount(connection, resourceName, userNames) {
    const hub = connection.hub;
    const app = connection.app;

    const maximumUserCount = userNames.length;

    async function createTriggerRule(countID, triggerID, oldValue, newValue) {
        const body = `{
            "name": "(${resourceName}${oldValue > newValue ? "-" : "+"})",
            "conditions": [
                {
                    "address": "/sensors/${triggerID}/state/lastupdated",
                    "operator": "dx"
                },
                {
                    "address": "/sensors/${countID}/state/status",
                    "operator": "eq",
                    "value": "${oldValue}"
                }
            ],
            "actions": [
                {
                    "address": "/sensors/${countID}/state",
                    "method": "PUT",
                    "body": {
                        "status": ${newValue}
                    }
                }
            ]
        }`;

        return createRule(connection, body);
    }

    async function createTriggerSensor(countID, value) {
        const body = `{
            "name": "${resourceName}${value > 0 ? "+" : "-"}",
            "state": {
                "flag": false
            },
            "config": {
                "on": true,
                "reachable": true
            },
            "type": "CLIPGenericFlag",
            "modelid": "(User Count Trigger)",
            "manufacturername": "Callionica",
            "swversion": "1.0",
            "uniqueid": "${uuid()}",
            "recycle": false
        }`;

        const id = await createSensor(connection, body);
        const rules = [];
        for (var i = 0; i < maximumUserCount; ++i) {
            const oldValue = (value > 0) ? i : i - value;
            const newValue = oldValue + value;
            const ruleID = await createTriggerRule(countID, id, oldValue, newValue);
            rules.push(ruleID);
        }

        return { id, rules };
    }

    async function createUserCountSensor() {
        const body = `{
            "name": "${resourceName}",
            "state": {
                "status": 0
            },
            "config": {
                "on": true,
                "reachable": true
            },
            "type": "CLIPGenericStatus",
            "modelid": "User Count",
            "manufacturername": "Callionica",
            "swversion": "1.0",
            "uniqueid": "${uuid()}",
            "recycle": false
        }`;

        return createSensor(connection, body);
    }

    async function createUserRule(userID, userName, value, triggerID) {
        const body = `{
            "name": "(${userName})",
            "conditions": [
                {
                    "address": "/sensors/${userID}/state/flag",
                    "operator": "eq",
                    "value": "${value}"
                }
            ],
            "actions": [
                {
                    "address": "/sensors/${triggerID}/state",
                    "method": "PUT",
                    "body": {
                        "flag": true
                    }
                }
            ]
        }`;

        return createRule(connection, body);
    }

    async function createUserSensor(userName, increment, decrement) {
        const body = `{
            "name": "${userName}",
            "state": {
                "flag": false
            },
            "config": {
                "on": true,
                "reachable": true
            },
            "type": "CLIPGenericFlag",
            "modelid": "User Count User",
            "manufacturername": "Callionica",
            "swversion": "1.0",
            "uniqueid": "${uuid()}",
            "recycle": false
        }`;

        const id = await createSensor(connection, body);

        const inc = await createUserRule(id, userName, true, increment.id);
        const dec = await createUserRule(id, userName, false, decrement.id);
        const rules = [inc, dec];

        return { id, name: userName, rules };
    }

    async function createOverrideRule(triggerID, users, value) {
        const actions = users.map(user => {
            return `{
                "address": "/sensors/${user.id}/state",
                "method": "PUT",
                "body": {
                    "flag": ${value}
                }
            }`;
        }).join(",\n");

        const body = `{
            "name": "(${resourceName} Override)",
            "conditions": [
                {
                    "address": "/sensors/${triggerID}/state/lastupdated",
                    "operator": "dx"
                },
                {
                    "address": "/sensors/${triggerID}/state/flag",
                    "operator": "eq",
                    "value": "${value}"
                }
            ],
            "actions": [
                ${actions}
            ]
        }`;

        return createRule(connection, body);
    }

    async function createOverrideSensor(users) {
        const body = `{
            "name": "${resourceName} Override",
            "state": {
                "flag": false
            },
            "config": {
                "on": true,
                "reachable": true
            },
            "type": "CLIPGenericFlag",
            "modelid": "User Count Override",
            "manufacturername": "Callionica",
            "swversion": "1.0",
            "uniqueid": "${uuid()}",
            "recycle": false
        }`;

        const id = await createSensor(connection, body);

        const rules = [
            await createOverrideRule(id, users, false),
            await createOverrideRule(id, users, true)
        ];

        return { id, rules };
    }

    const id = await createUserCountSensor();
    const increment = await createTriggerSensor(id, +1);
    const decrement = await createTriggerSensor(id, -1);
    const users = [];
    for (const userName of userNames) {
        const user = await createUserSensor(userName, increment, decrement);
        users.push(user);
    }
    const override = await createOverrideSensor(users);

    return { id, name: resourceName, triggers: [increment, decrement], users, override };
}

async function deleteUserCount(connection, uc) {

    for (const rule of uc.override.rules) {
        await deleteRule(connection, rule);
    }

    await deleteSensor(connection, uc.override.id);

    for (const user of uc.users) {
        for (const rule of user.rules) {
            await deleteRule(connection, rule);
        }

        await deleteSensor(connection, user.id);
    }

    for (const trigger of uc.triggers) {
        for (const rule of trigger.rules) {
            await deleteRule(connection, rule);
        }

        await deleteSensor(connection, trigger.id);
    }

    await deleteSensor(connection, uc.id);
}

function statusSensorBody(name, model) {
    const body = `{
        "name": "${name}",
        "state": {
            "status": 0
        },
        "config": {
            "on": true,
            "reachable": true
        },
        "type": "CLIPGenericStatus",
        "modelid": "${model}",
        "manufacturername": "Callionica",
        "swversion": "1.0",
        "uniqueid": "${uuid()}",
        "recycle": false
    }`;
    return body;
}

function flagSensorBody(name, model, value) {
    const body = `{
        "name": "${name}",
        "state": {
            "flag": ${value}
        },
        "config": {
            "on": true,
            "reachable": true
        },
        "type": "CLIPGenericFlag",
        "modelid": "${model}",
        "manufacturername": "Callionica",
        "swversion": "1.0",
        "uniqueid": "${uuid()}",
        "recycle": false
    }`;
    return body;
}

async function createLinks(connection, name, description, links) {
    const body = `{
    "name": "${name}",
    "description": "${description}",
    "classid": 9090,
    "links": [
        ${links.map(l => JSON.stringify(l)).join(",\n\t\t")}
    ]
}`;
    return createResourceLink(connection, body);
}

// zone: { name, power: { enabled, lowpower, off }}
async function createPowerManagedZone(connection, zone) {

    // 2. A rule: status == on(2) and lastupdate ddx A, change status to lowpower(1)
    async function fullPowerToLowPower(id, controlID, hms) {
        const body = `{
            "name": "Full power to low power",
            "conditions": [
                {
                    "address": "/sensors/${controlID}/state/flag",
                    "operator": "eq",
                    "value": "true"
                },
                {
                    "address": "/sensors/${id}/state/lastupdated",
                    "operator": "ddx",
                    "value": "PT${hms}"
                },
                {
                    "address": "/sensors/${id}/state/status",
                    "operator": "eq",
                    "value": "2"
                }
            ],
            "actions": [
                {
                    "address": "/sensors/${id}/state",
                    "method": "PUT",
                    "body": {
                        "status": 1
                    }
                }
            ]
        }`;
        return createRule(connection, body);
    }

    async function fullPowerToLowPowerEnablement(id, controlID, hms) {
        const body = `{
            "name": "Full power to low power",
            "conditions": [
                {
                    "address": "/sensors/${controlID}/state/flag",
                    "operator": "eq",
                    "value": "true"
                },
                {
                    "address": "/sensors/${controlID}/state/flag",
                    "operator": "ddx",
                    "value": "PT${hms}"
                },
                {
                    "address": "/sensors/${id}/state/status",
                    "operator": "eq",
                    "value": "2"
                },
                {
                    "address": "/sensors/${id}/state/status",
                    "operator": "stable",
                    "value": "PT${hms}"
                }
            ],
            "actions": [
                {
                    "address": "/sensors/${id}/state",
                    "method": "PUT",
                    "body": {
                        "status": 1
                    }
                }
            ]
        }`;
        return createRule(connection, body);
    }

    // 3. A rule: status == lowpower(1) and status ddx B, change status to off(0)
    async function lowPowerToOff(id, controlID, hms) {
        const body = `{
            "name": "Low power to off",
            "conditions": [
                {
                    "address": "/sensors/${controlID}/state/flag",
                    "operator": "eq",
                    "value": "true"
                },
                {
                    "address": "/sensors/${id}/state/status",
                    "operator": "ddx",
                    "value": "PT${hms}"
                },
                {
                    "address": "/sensors/${id}/state/status",
                    "operator": "eq",
                    "value": "1"
                }
            ],
            "actions": [
                {
                    "address": "/sensors/${id}/state",
                    "method": "PUT",
                    "body": {
                        "status": 0
                    }
                }
            ]
        }`;
        return createRule(connection, body);
    }

    async function lowPowerToOffEnablement(id, controlID, hms) {
        const body = `{
            "name": "Low power to off",
            "conditions": [
                {
                    "address": "/sensors/${controlID}/state/flag",
                    "operator": "eq",
                    "value": "true"
                },
                {
                    "address": "/sensors/${controlID}/state/flag",
                    "operator": "ddx",
                    "value": "PT${hms}"
                },
                {
                    "address": "/sensors/${id}/state/status",
                    "operator": "eq",
                    "value": "1"
                },
                {
                    "address": "/sensors/${id}/state/status",
                    "operator": "stable",
                    "value": "PT${hms}"
                }
            ],
            "actions": [
                {
                    "address": "/sensors/${id}/state",
                    "method": "PUT",
                    "body": {
                        "status": 0
                    }
                }
            ]
        }`;
        return createRule(connection, body);
    }

    // Power management automatically moves a zone from full power (2) to low power (1) to off (0)
    const body = statusSensorBody(zone.name, "Power Managed Zone");
    const id = await createSensor(connection, body);

    // Power management can be enabled/disabled for each zone
    const controlBody = flagSensorBody(zone.name, "Power Management Enabled", zone.power.enabled)
    const controlID = await createSensor(connection, controlBody);

    // The power switching rules
    const fullToLow = await fullPowerToLowPower(id, controlID, zone.power.lowpower);
    const fullToLowE = await fullPowerToLowPowerEnablement(id, controlID, zone.power.lowpower);
    const lowToOff = await lowPowerToOff(id, controlID, zone.power.off);
    const lowToOffE = await lowPowerToOffEnablement(id, controlID, zone.power.off);

    const rl = await createLinks(connection, zone.name, "Power Managed Zone. Turns off after period of time.", [
        `/sensors/${id}`,
        `/sensors/${controlID}`,
        `/rules/${fullToLow}`,
        `/rules/${fullToLowE}`,
        `/rules/${lowToOff}`,
        `/rules/${lowToOffE}`,
    ]);

    return { sensors: [id, controlID], rules: [fullToLow, fullToLowE, lowToOff, lowToOffE], resourceLinks: [rl] };
}
