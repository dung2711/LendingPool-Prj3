import dotenv from "dotenv";
import { Sequelize } from "sequelize";

dotenv.config();

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
    })
  : new Sequelize(
      process.env.PG_DATABASE,
      process.env.PG_USERNAME,
      process.env.PG_PASSWORD,
      {
        host: process.env.PG_HOST,
        dialect: "postgres",
        logging: false,
      },
    );

export default sequelize;
