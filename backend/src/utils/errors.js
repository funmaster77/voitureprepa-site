// Helpers pour renvoyer des erreurs HTTP propres et homogènes.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest    = (msg, details) => new HttpError(400, msg, details);
export const unauthorized  = (msg = 'Authentification requise.') => new HttpError(401, msg);
export const forbidden     = (msg = 'Accès refusé.') => new HttpError(403, msg);
export const notFound      = (msg = 'Ressource introuvable.') => new HttpError(404, msg);
export const conflict      = (msg) => new HttpError(409, msg);
export const tooMany       = (msg = 'Trop de requêtes.') => new HttpError(429, msg);

// Plugin Fastify pour transformer un HttpError en réponse JSON.
export function registerErrorHandler(app) {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      reply.code(err.status).send({ error: err.message, details: err.details });
      return;
    }
    // Erreurs Zod
    if (err && err.code === 'FST_ERR_VALIDATION') {
      reply.code(400).send({ error: 'Données invalides.', details: err.validation });
      return;
    }
    // Erreur inattendue : log côté serveur, message générique côté client.
    req.log.error(err);
    reply.code(500).send({ error: 'Erreur interne du serveur.' });
  });
}
