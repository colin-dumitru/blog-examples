/* These three partials will be cached by our service workers and injected into our main pages */
var templates = [
    "/partials/header.html",
    "/partials/footer.html"
  ],
  indexDBRequest = indexedDB.open("TemplatesDatabase", 9),
  /* Once it resolves, we will use this promise to store and retrieve partials from IndexDB */
  db = new Promise(function(resolve, reject) {

    indexDBRequest.onupgradeneeded = function(event) {
      var db = event.target.result;

      /* Create an object store to hold the content of our partials */
      templateStore = db.createObjectStore("templates", {
        keyPath: "path"
      });
      /* Also create an index on the partial path, to query over it later */
      templateStore.createIndex("path", "path", {
        unique: true
      });
      templateStore.transaction.oncomplete = function(event) {
        resolve(db);
      }
    };

    indexDBRequest.onsuccess = function(event) {
      resolve(event.target.result);
    };
  });



function storeTemplate(template, body) {
  return new Promise(function(resolve, reject) {
    db.then(function(db) {
      /* Create a new transation for storing a partials path and it's content */
      var store = db.transaction("templates", "readwrite").objectStore("templates");

      /* Add the actual partial */
      store.add({
        path: template,
        body: body.replace(/#time/, new Date().toString())
      });
    });
  });
}

function getTemplate(template) {
  return new Promise(function(resolve, reject) {
    db.then(function(db) {
      var store = db.transaction("templates").objectStore("templates"),
        request = store.get(template);

      request.onerror = reject;
      request.onsuccess = function(event) {
        if (request.result) {
          resolve(request.result);
        } else {
          reject();
        }
      }
    });
  });
}

this.addEventListener("install", function(e) {
  e.waitUntil(
    templates.map(function(template) {
      return fetch(template)
        .then(function(res) {
          /* The text() method returns a Promise, which we chain */
          return res.text();
        })
        .then(function(res) {
          /* The storeTemplate() method also returns a promise */
          return storeTemplate(template, res);
        });
    })
  );
});

this.addEventListener("fetch", function(event) {
  var mainPromise = fetch(event.request.url)
    .then(function(request) {
      /* The text() method will return a Promise which resolves to the full
      text content of the requested page -- the page HTML */
      return request.text();
    })
    .then(function(text) {
      /* With the full HTML of the page, we can now scan the content for partials
      which are of the form {{<partial url>}} */
      return Promise.all(
        [
          /* Also add the initial page content, so we can replace the placeholers
          with the full HTML of the partials */
          new Promise(function(resolve) {
            resolve(text);
          })
        ].concat(
          /* For each placeholder, fetch the HTML from IndexDB and return it
          as a promise */
          text.match(/{{.*?}}/g).map(function(template) {
            return getTemplate(template.match(/[^{].*[^}]/)[0]);
          })
        )
      );
    })
    .then(function(templates) {
      /* Replace the #time placeholder with the current timestamp, to check when
      the request was made. */
      var content = templates[0].replace(/#time/, new Date().toString());

      /* For each partial, replace the placeholder inside the original text
      with the full partial HTML */
      templates.splice(1).forEach(function(template) {
        content = content.replace("{{" + template.path + "}}", template.body);
      });

      /* Finally, return the processed HTML content to the browser to be
      rendered. Make sure tho set the correct content type. */
      return new Response(content, {
        headers: {
          "content-type": "text/html"
        }
      });
    });

  event.respondWith(mainPromise);
});
