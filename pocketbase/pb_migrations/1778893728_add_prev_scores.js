/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const games = app.findCollectionByNameOrId("games")
  games.fields.add(new NumberField({ name: "player1_prev" }))
  games.fields.add(new NumberField({ name: "player2_prev" }))
  app.save(games)
}, (app) => {
  const games = app.findCollectionByNameOrId("games")
  games.fields.removeByName("player1_prev")
  games.fields.removeByName("player2_prev")
  app.save(games)
})
