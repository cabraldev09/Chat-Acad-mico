import { QueryInterface, DataTypes } from "sequelize";

// WhatsApp profile picture addresses are longer than 255 characters, and the incoming message that carried
// one was dropped. Media file names can be long too.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Contacts", "profilePicUrl", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.changeColumn("Messages", "mediaUrl", {
      type: DataTypes.TEXT,
      allowNull: true
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Contacts", "profilePicUrl", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.changeColumn("Messages", "mediaUrl", {
      type: DataTypes.STRING,
      allowNull: true
    });
  }
};
