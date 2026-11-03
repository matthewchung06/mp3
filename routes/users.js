var mongoose = require('mongoose');
var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {

    var usersRoute = router.route('/users');
    var usersIdRoute = router.route('/users/:id');

    usersRoute.get(async function (req, res) {
        var where = {};
        var sort = {};
        var select = {};
        try {
            if (req.query.where) where = JSON.parse(req.query.where);
            if (req.query.sort) sort = JSON.parse(req.query.sort);
            if (req.query.select) select = JSON.parse(req.query.select);
        } catch (err) {
            return res.status(400).json({ message: 'The query parameters are not valid JSON', data: [] });
        }

        try {
            if (req.query.count === 'true') {
                var total = await User.countDocuments(where);
                return res.status(200).json({ message: 'OK', data: total });
            }

            var query = User.find(where).sort(sort).select(select);
            if (req.query.skip) query.skip(Number(req.query.skip));
            if (req.query.limit) query.limit(Number(req.query.limit));

            var users = await query.exec();
            res.status(200).json({ message: 'OK', data: users });
        } catch (err) {
            res.status(500).json({ message: 'Could not get the users', data: [] });
        }
    });

    usersRoute.post(async function (req, res) {
        try {
            var name = req.body.name;
            var email = req.body.email;
            if (typeof name !== 'string' || name === '' || typeof email !== 'string' || email === '') {
                return res.status(400).json({ message: 'A user needs a name and an email', data: [] });
            }

            var pendingTasks = req.body.pendingTasks === undefined ? [] : req.body.pendingTasks;
            if (!Array.isArray(pendingTasks)) {
                return res.status(400).json({ message: 'pendingTasks has to be a list of task ids', data: [] });
            }
            for (var i = 0; i < pendingTasks.length; i++) {
                if (!mongoose.Types.ObjectId.isValid(pendingTasks[i])) {
                    return res.status(400).json({ message: 'pendingTasks has an id that is not a valid task id', data: [] });
                }
            }

            var taken = await User.findOne({ email: email });
            if (taken) {
                return res.status(400).json({ message: 'That email is already being used', data: [] });
            }

            var tasks = [];
            for (var i = 0; i < pendingTasks.length; i++) {
                var task = await Task.findById(pendingTasks[i]);
                if (!task) {
                    return res.status(404).json({ message: 'One of the pending tasks does not exist', data: [] });
                }
                tasks.push(task);
            }
            for (var i = 0; i < tasks.length; i++) {
                if (tasks[i].completed) {
                    return res.status(400).json({ message: 'A completed task cannot be a pending task', data: [] });
                }
            }

            var user = await User.create({ name: name, email: email, pendingTasks: pendingTasks });

            // these tasks belong to this user now, so take them off their old owner's list
            for (var i = 0; i < tasks.length; i++) {
                var previousOwner = tasks[i].assignedUser;
                if (previousOwner !== '' && previousOwner !== user._id.toString()) {
                    await User.updateOne({ _id: previousOwner }, { $pull: { pendingTasks: tasks[i]._id.toString() } });
                }
                tasks[i].assignedUser = user._id.toString();
                tasks[i].assignedUserName = user.name;
                await tasks[i].save();
            }

            res.status(201).json({ message: 'User created', data: user });
        } catch (err) {
            res.status(500).json({ message: 'Could not create the user', data: [] });
        }
    });

    usersIdRoute.get(async function (req, res) {
        var select = {};
        try {
            if (req.query.select) select = JSON.parse(req.query.select);
        } catch (err) {
            return res.status(400).json({ message: 'The select parameter is not valid JSON', data: [] });
        }

        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }
            var user = await User.findById(req.params.id).select(select).exec();
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }
            res.status(200).json({ message: 'OK', data: user });
        } catch (err) {
            res.status(500).json({ message: 'Could not get the user', data: [] });
        }
    });

    usersIdRoute.put(async function (req, res) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }
            var user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }

            var name = req.body.name;
            var email = req.body.email;
            if (typeof name !== 'string' || name === '' || typeof email !== 'string' || email === '') {
                return res.status(400).json({ message: 'A user needs a name and an email', data: [] });
            }

            var pendingTasks = req.body.pendingTasks === undefined ? [] : req.body.pendingTasks;
            if (!Array.isArray(pendingTasks)) {
                return res.status(400).json({ message: 'pendingTasks has to be a list of task ids', data: [] });
            }
            for (var i = 0; i < pendingTasks.length; i++) {
                if (!mongoose.Types.ObjectId.isValid(pendingTasks[i])) {
                    return res.status(400).json({ message: 'pendingTasks has an id that is not a valid task id', data: [] });
                }
            }

            var taken = await User.findOne({ email: email });
            if (taken && taken._id.toString() !== user._id.toString()) {
                return res.status(400).json({ message: 'That email is already being used', data: [] });
            }

            var tasks = [];
            for (var i = 0; i < pendingTasks.length; i++) {
                var task = await Task.findById(pendingTasks[i]);
                if (!task) {
                    return res.status(404).json({ message: 'One of the pending tasks does not exist', data: [] });
                }
                tasks.push(task);
            }
            for (var i = 0; i < tasks.length; i++) {
                if (tasks[i].completed) {
                    return res.status(400).json({ message: 'A completed task cannot be a pending task', data: [] });
                }
            }

            var dropped = user.pendingTasks.filter(function (id) {
                return pendingTasks.indexOf(id) === -1;
            });

            user.name = name;
            user.email = email;
            user.pendingTasks = pendingTasks;
            await user.save();

            // tasks that are no longer pending for this user go back to being unassigned
            for (var i = 0; i < dropped.length; i++) {
                await Task.updateOne({ _id: dropped[i] }, { assignedUser: '', assignedUserName: 'unassigned' });
            }

            // these tasks belong to this user now, so take them off their old owner's list
            for (var i = 0; i < tasks.length; i++) {
                var previousOwner = tasks[i].assignedUser;
                if (previousOwner !== '' && previousOwner !== user._id.toString()) {
                    await User.updateOne({ _id: previousOwner }, { $pull: { pendingTasks: tasks[i]._id.toString() } });
                }
                tasks[i].assignedUser = user._id.toString();
                tasks[i].assignedUserName = user.name;
                await tasks[i].save();
            }

            // the name may have changed, so fix it on every task this user still has
            await Task.updateMany({ assignedUser: user._id.toString() }, { assignedUserName: user.name });

            res.status(200).json({ message: 'User updated', data: user });
        } catch (err) {
            res.status(500).json({ message: 'Could not update the user', data: [] });
        }
    });

    usersIdRoute.delete(async function (req, res) {
        try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }
            var user = await User.findByIdAndDelete(req.params.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found', data: [] });
            }

            await Task.updateMany({ assignedUser: user._id.toString() }, { assignedUser: '', assignedUserName: 'unassigned' });

            res.status(200).json({ message: 'User deleted', data: user });
        } catch (err) {
            res.status(500).json({ message: 'Could not delete the user', data: [] });
        }
    });

    return router;
};
