var templates = [
        "/partials/header.html",
        "/partials/footer.html"
    ],
    indexDBRequest = indexedDB.open("TemplatesDatabase", 9),
    db = new Promise(function (resolve, reject) {

        indexDBRequest.onupgradeneeded = function (event) {
            var db = event.target.result;

            if (!db.objectStoreNames.contains("templates")) {
                templateStore = db.createObjectStore("templates", {
                    keyPath: "path"
                });

                templateStore.createIndex("path", "path", {
                    unique: true
                });

                templateStore.transaction.oncomplete = function (event) {
                    resolve(db);
                }
            } else {
                resolve(db);
            }
        };

        indexDBRequest.onsuccess = function (event) {
            resolve(event.target.result);
        };
    });



function storeTemplate(template, body) {
    return new Promise(function (resolve, reject) {
        db.then(function (db) {
            var store = db.transaction("templates", "readwrite").objectStore("templates");

            store.add({
                path: template,
                body: body.replace(/#time/, new Date().toString())
            });
        });
    });
}

function getTemplate(template) {
    return new Promise(function (resolve, reject) {
        db.then(function (db) {
            var store = db.transaction("templates").objectStore("templates"),
                request = store.get(template);

            request.onerror = reject;
            request.onsuccess = function (event) {
                if (request.result) {
                    resolve(request.result);
                } else {
                    reject();
                }
            }
        });
    });
}

templates.map(function (template) {
    return fetch(template)
        .then(function (res) {
            return res.text();
        })
        .then(function (res) {
            return storeTemplate(template, res);
        });
})

this.addEventListener("install", function (e) {
    e.waitUntil(
        templates.map(function (template) {
            return fetch(template)
                .then(function (res) {
                    return res.text();
                })
                .then(function (res) {
                    return storeTemplate(template, res);
                });
        })
    );
});

this.addEventListener("fetch", function (event) {
    var mainPromise = fetch(event.request.url)
        .then(function (request) {
            return request.text();
        })
        .then(function (text) {
            return Promise.all(
                [
                    new Promise(function (resolve) {
                        resolve(text);
                    })
                ].concat(
                    text.match(/{{.*?}}/g).map(function (template) {
                        return getTemplate(template.match(/[^{].*[^}]/)[0]);
                    })
                )
            );
        })
        .then(function (templates) {
            var content = templates[0].replace(/#time/, new Date().toString());

            templates.splice(1).forEach(function (template) {
                content = content.replace("{{" + template.path + "}}", template.body);
            });
            return new Response(content, {
                headers: {
                    "content-type": "text/html"
                }
            });
        });

    event.respondWith(mainPromise);
});
