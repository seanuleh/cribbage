/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("games")
  collection.schema.addField(new SchemaField({
    "name": "player1_prev", "type": "number", "required": false, "options": {}
  }))
  collection.schema.addField(new SchemaField({
    "name": "player2_prev", "type": "number", "required": false, "options": {}
  }))
  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("games")
  collection.schema.removeField(collection.schema.getFieldByName("player1_prev").id)
  collection.schema.removeField(collection.schema.getFieldByName("player2_prev").id)
  return dao.saveCollection(collection)
})
