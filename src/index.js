const MAIN_POST_ID = 332585143754045;
const MAX_CONCURRENT_TABS = 1;
let acitveTabs = 0;

const parseMainPost = (post) => {
    const lines = post.split('\n');
    const indexes = lines
        .map((line, index) => !isNaN(+line[0]) && line.length > 1 ? index : null)
        .filter(item => !!item);
    indexes.push(lines.length - 1);
    const cats = [];
    for (let i = 0; i < indexes.length; i++) {
        const index = indexes[i];
        const name = lines[index];
        const links = lines.slice(index, indexes[i + 1])
            .map(ls => ls.split(' ').map(l => l.trim()))
            .reduce((items, current, index) => [...items, ...current], [])
            .filter(link => link.indexOf('https') === 0);
        cats.push({
            name,
            links
        })
    }
    return cats.filter(cat => !!cat.name && cat.links.length);
};

const saveToSpreadSheet = (token, spreadsheetId, range, values) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
    const body = {
        range: range,
        "majorDimension": "ROWS",
        "values": values,
    };

    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `OAuth ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(response => response.json())
        .then(json => console.log(json));

};

const addSheet = (token, spreadSheetId, title) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadSheetId}:batchUpdate`;
    const body = {
        requests: [
            {
                addSheet: {
                    properties: {
                        title: title
                    }
                }
            }
        ]
    };
    return fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `OAuth ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(response => response.json())
};

const getSheet = (token, sheetId) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

    return fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `OAuth ${token}`,
            'Content-Type': 'application/json'
        },
    })
        .then(response => response.json())
};

const getFBPost = (fbToken, postId) => {
    const url = `https://graph.facebook.com/v2.9/${postId}`;
    return fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `OAuth ${fbToken}`,
            'Content-Type': 'application/json'
        },
    })
        .then(response => response.json())
};

const saveMainPost = (token, sheetId, sheet, cats) => {
    const sheets = sheet.sheets.map(sheet => sheet.properties.title);
    const categoriesMap = {};
    const promises = cats.map(
        cat => {
            let addSheetPromise;
            if (!sheets.includes(cat.name)) {
                addSheetPromise = addSheet(token, sheetId, cat.name)
                    .then(response => response.replies.map(reply => reply.addSheet));

            } else {
                addSheetPromise = Promise.resolve(
                    sheet.sheets.filter(sheet => sheet.properties.title === cat.name)
                )
            }
            return addSheetPromise.then(sheet => {
                const item = {
                    category: cat,
                    sheet
                };
                categoriesMap[cat.name] = item;
                return item;
            });
        }
    );
    Promise.all(promises).then(
        (items) => saveCategories(categoriesMap, (cat, link, {postId = "", postText = "", author = ""} = {}) => {
            saveToSpreadSheet(token, sheetId, `${cat.name}!A:E`, [[
                postId, author.name, author.url, link, postText
            ]])
        })
    )
};

const checkPostExistence = (token, mainSheetFileId, category, postId) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${mainSheetFileId}/values/${category}!A:E`;
    return fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `OAuth ${token}`,
            'Content-Type': 'application/json'
        },
    }).then(response => response.json())
        .then(response => response.values)
        .then((values = []) => values.map(row => row[0]))
        .then((ids = []) => ids.includes(postId));
};

const saveCategories = (categoriesMap, cb) => {
    Object.keys(categoriesMap).forEach(
        key => {
            const {category} = categoriesMap[key];
            category.links.forEach(link => getAndSaveLink(link, data => cb(category, link, data)));
        }
    )
};

const getAndSaveLink = (link, cb) => {
    if (acitveTabs < MAX_CONCURRENT_TABS) {
        acitveTabs++;
        openLink(link, cb);
    } else {
        setTimeout(() => getAndSaveLink(link, cb), 1000);
    }
};

openLink = (link, cb) => {
    chrome.tabs.create({
        url: link,
        active: false
    }, tab => {
        parseTab(tab, cb)
    })
};

parseTab = (tab, cb) => {
    if (tab.status === 'loading') {
        setTimeout(() => chrome.tabs.query({url: tab.url}, tabs => parseTab(tabs[0], cb)), 1000);
    } else {
        chrome.tabs.sendMessage(tab.id, {type: 'post-data'}, response => {
            cb(response);
            setTimeout(() => chrome.tabs.remove(tab.id, () => acitveTabs--));
        });
    }
};

const getInputCategory = () => {
    return $('select').val();
};

const getGoogleToken = () => {
    // Array of API discovery doc URLs for APIs used by the quickstart
    // const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];

    return new Promise((resolve, reject) => {

        const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
        const googleAuth = new OAuth2('google', Object.assign({}, googleClient, {api_scope: SCOPES}));
        googleAuth.authorize(() => {
            resolve(googleAuth.getAccessToken());
        });
    });
};

const getFbToken = () => {
    return new Promise((resolve, reject) => {
        const FB_SCOPES = 'user_posts';
        const fbAuth = new OAuth2('facebook', Object.assign({}, fbClient, {api_scope: FB_SCOPES}));
        fbAuth.authorize(
            () => {
                resolve(fbAuth.getAccessToken())
            }
        )
    });
};

const init = () => {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, tabs => {
            chrome.tabs.sendMessage(tabs[0].id, {type: 'post-data'}, response => {
                console.log('response is coming');
                console.log(response);
                getGoogleToken().then(
                    token => {
                        getSheet(token, SPREAD_SHEET)
                            .then(mainSheetFile => {
                                const data = {
                                    mainSheetFile,
                                    googleToken: token,
                                    tabDetails: response
                                };
                                resolve(data);
                            })
                    }
                )
            })
        });
    });
};

const onButtonClick = (postId, response, token, mainSheetFile) => {
    if (+postId === MAIN_POST_ID) {
        const cats = parseMainPost(response.postText);
        saveMainPost(token, SPREAD_SHEET, mainSheetFile, cats);
    } else {
        const category = getInputCategory();
        const innerSheet = mainSheetFile.sheets
                .map(sheet => sheet.properties.title)
                .filter(title => title === category)[0] | null;

        if (!!category) {
            let addSheetPromise;
            if (!innerSheet) {
                addSheetPromise = addSheet(token, SPREAD_SHEET, category);
            } else {
                console.log(innerSheet);
                addSheetPromise = Promise.resolve(innerSheet)
            }
            addSheetPromise
                .then(sheet => checkPostExistence(token, SPREAD_SHEET, category, postId))
                .then(
                    alreadyExist => !alreadyExist &&
                    saveToSpreadSheet(token, SPREAD_SHEET, `${category}!A:E`, [[
                        postId, response.author.name, response.author.url, response.url, response.postText
                    ]])
                )
        }
    }
};

$(() => {
    $('#div-fields').hide();
    $('#div-loading').show();
    const $select = $('select');
    init().then(
        data => {
            $select.select2({
                tags: true,
                data: data.mainSheetFile.sheets.map(sheet => ({
                    id: sheet.properties.title,
                    text: sheet.properties.title,
                }))
            });

            $select.trigger('open');
            $select.trigger('close');
            $select.on("select2:open", () =>{
                setTimeout(() => {
                    const height = $('.select2-dropdown').height() + 10;
                    $('#btn_submit').css('margin-top', `${height}px`);
                });
            });
            $select.on("select2:close", () =>{
                $('#btn_submit').css('margin-top', 10);
            });

            $('#div-loading').hide();
            $('#div-fields').show();
            $('#btn_submit').on('click',
                () => onButtonClick(data.tabDetails.postId, data.tabDetails, data.googleToken, data.mainSheetFile)
            );
        }
    );
});