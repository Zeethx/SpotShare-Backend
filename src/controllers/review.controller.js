import { Review } from '../models/review.model.js';
import { Reservation } from '../models/reservation.model.js';
import { ParkingSpace } from '../models/parkingSpace.model.js';
import { User } from '../models/user.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { APIError } from '../utils/APIError.js';
import { APIResponse } from '../utils/APIResponse.js';

const createReview = asyncHandler(async (req, res, next) => {
    try {
        const { parkingId, reservationId } = req.params;
        const { rating, comment } = req.body;

        const user = await User.findOne({ uid: req.user.uid });
        if (!user) {
            throw new APIError(404, "User not found");
        }

        const parkingSpace = await ParkingSpace.findById(parkingId);
        if (!parkingSpace) {
            throw new APIError(404, "Parking space not found");
        }

        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
            throw new APIError(404, "Reservation not found");
        }

        if (reservation.endTime > new Date()) {
            throw new APIError(400, "Reservation has not ended yet");
        }

        const review = new Review({
            user: user._id,
            parkingSpace: parkingId,
            reservation: reservationId,
            rating,
            comment
        });

        await review.save();
        parkingSpace.reviews.push(review._id);
        await parkingSpace.save();

        reservation.review = review._id;
        reservation.status = "Completed";
        await reservation.save();

        return res.status(201).json(new APIResponse(201, "Review created successfully", { review }));
    } catch (error) {
        next(error);
    }
});

const getReviews = asyncHandler(async (req, res, next) => {
    try {
        const { spotId } = req.params;

        const parkingSpace = await ParkingSpace.findById(spotId).populate("reviews");
        if (!parkingSpace) {
            throw new APIError(404, "Parking space not found");
        }

        return res.status(200).json(new APIResponse(200, "Reviews retrieved successfully", { reviews: parkingSpace.reviews }));
    } catch (error) {
        next(error);
    }
});

export { createReview, getReviews };
