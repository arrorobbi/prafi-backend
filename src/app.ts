import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { IMAGES_DIR, IMAGES_URL_PATH } from './config/upload';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { requestLogger } from './middlewares/requestLogger';
import routes from './routes';

export const app = express();

app.disable('x-powered-by');
app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin.length ? env.corsOrigin : false, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Public image files: http://<APP_URL>/images/<filename>
app.use(
  IMAGES_URL_PATH,
  express.static(IMAGES_DIR, {
    index: false,
    dotfiles: 'ignore',
    maxAge: '7d',
    setHeaders: (res) => {
      // Helmet defaults to same-origin, which would block <img> tags on the frontend's origin
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

app.use('/api', routes);

// Must be registered last
app.use(notFoundHandler);
app.use(errorHandler);
