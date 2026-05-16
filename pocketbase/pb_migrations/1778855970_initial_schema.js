/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)

  // Update the auto-created users collection rules
  try {
    const users = dao.findCollectionByNameOrId("users")
    users.listRule = "id = @request.auth.id"
    users.viewRule = "id = @request.auth.id"
    users.createRule = null
    users.updateRule = "id = @request.auth.id"
    users.deleteRule = null
    dao.saveCollection(users)
  } catch (e) {
    // users collection doesn't exist yet — create it
    const users = new Collection({
      "name": "users",
      "type": "auth",
      "listRule": "id = @request.auth.id",
      "viewRule": "id = @request.auth.id",
      "createRule": null,
      "updateRule": "id = @request.auth.id",
      "deleteRule": null,
      "schema": []
    })
    dao.saveCollection(users)
  }

  const games = new Collection({
    "name": "games",
    "type": "base",
    "listRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id",
    "createRule": "@request.auth.id != \"\"",
    "updateRule": "user = @request.auth.id",
    "deleteRule": "user = @request.auth.id",
    "schema": [
      {"name": "player1_name", "type": "text", "required": true, "options": {}},
      {"name": "player2_name", "type": "text", "required": true, "options": {}},
      {"name": "player1_score", "type": "number", "required": false, "options": {}},
      {"name": "player2_score", "type": "number", "required": false, "options": {}},
      {"name": "active", "type": "bool", "required": false, "options": {}},
      {"name": "user", "type": "relation", "required": false,
       "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": true, "maxSelect": 1}}
    ]
  })
  dao.saveCollection(games)
}, (db) => {
  const dao = new Dao(db)
  try { dao.deleteCollection(dao.findCollectionByNameOrId("games")) } catch(e) {}
})
