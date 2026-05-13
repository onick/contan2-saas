import { Router } from 'express';

export function createDashboardRouter() {
  const router = Router();

  router.get('/stats', async (req, res, next) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [
        totalUsers,
        totalActivities,
        activitiesToday,
        activeActivities,
        totalAttendances,
        topActivities,
        allUsers,
      ] = await Promise.all([
        req.repos.users.count(),
        req.repos.activities.count(),
        req.repos.activities.countByDate(today),
        req.repos.activities.countByStatus('activa'),
        req.repos.attendance.count(),
        req.repos.activities.findTopByEnrolled(5),
        req.repos.users.findAll(),
      ]);

      const recentUsers = allUsers
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

      res.json({
        totalUsers,
        totalActivities,
        activitiesToday,
        activeActivities,
        totalAttendances,
        topActivities,
        recentUsers,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
