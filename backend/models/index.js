import User from './User.js';
import Asset from './Asset.js';
import Transaction from './Transaction.js';
import User_Asset from './User_Asset.js';
import Market_config from './Market_config.js';
import Liquidatable_Users from './Liquidatable_Users.js';

// Define associations
User.belongsToMany(Asset, { through: User_Asset, foreignKey: 'userAddress', otherKey: 'assetAddress' });
Asset.belongsToMany(User, { through: User_Asset, foreignKey: 'assetAddress', otherKey: 'userAddress' });

Transaction.belongsTo(User, { foreignKey: 'userAddress', targetKey: 'address' });
User.hasMany(Transaction, { foreignKey: 'userAddress', sourceKey: 'address' });

Transaction.belongsTo(Asset, { foreignKey: 'assetAddress', targetKey: 'address' });
Asset.hasMany(Transaction, { foreignKey: 'assetAddress', sourceKey: 'address' });

export {
    User,
    Asset,
    Transaction,
    User_Asset,
    Market_config,
    Liquidatable_Users
};