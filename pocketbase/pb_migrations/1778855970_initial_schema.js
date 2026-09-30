/// <reference path="../pb_data/types.d.ts" />
// PocketBase 0.23+ syntax (rewritten from the 0.22 Dao version; same timestamp, so
// already-applied databases skip it).
migrate((app) => {
  // users collection is auto-created by PocketBase; just tighten its rules
  const users = app.findCollectionByNameOrId("users")
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  users.createRule = null
  users.updateRule = "id = @request.auth.id"
  users.deleteRule = null
  app.save(users)

  const games = new Collection({
    name: "games",
    type: "base",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: "@request.auth.id != \"\"",
    updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "player1_name", type: "text", required: true },
      { name: "player2_name", type: "text", required: true },
      { name: "player1_score", type: "number" },
      { name: "player2_score", type: "number" },
      { name: "active", type: "bool" },
      { name: "user", type: "relation", collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  })
  app.save(games)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("games")) } catch (e) {}
})
