import { ParkingSpace } from "../models/parkingSpace.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIResponse.js";
import { getCoordinates } from "../utils/geoCoding.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { User } from "../models/user.model.js"; // Ensure you have user model
import { Reservation } from "../models/reservation.model.js";

// Function to transform customTimes object
const transformCustomTimes = (customTimes) => {
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const availability = [];

    daysOfWeek.forEach((day) => {
        if (customTimes[day.toLowerCase()]) {
            availability.push({
                day,
                fromTime: customTimes[day.toLowerCase()].in,
                toTime: customTimes[day.toLowerCase()].out
            });
        }
    });

    return availability;
};

const createParkingSpace = asyncHandler(async (req, res) => {
    const { owner, address, spotType, vehicleSize, spacesToRent, title, description, accessInstructions, spotImages, pricePerHour, pricePerDay, pricePerMonth, availableFrom, customTimes } = req.body;

    // Validate required fields
    if ([owner, address, spotType, vehicleSize, spacesToRent, title, description, spotImages, pricePerHour, pricePerDay, pricePerMonth, availableFrom, customTimes].some((field) => field === "")) {
        throw new APIError(400, "All fields are required");
    }

    // Validate image array length
    if (spotImages.length > 6) {
        throw new APIError(400, "You can only upload a maximum of 6 images");
    }

    // Convert owner email to ObjectId
    const user = await User.findOne({ email: owner });
    if (!user) {
        throw new APIError(400, "Owner not found");
    }

    // Get coordinates from address using Google Maps Geocoding API
    const { lat, lng } = await getCoordinates(address);
    const coordinates = [lng, lat]; // GeoJSON format

    // Transform customTimes object to availability array
    const daysAvailable = transformCustomTimes(customTimes);

    // Create new parking space
    const newParkingSpace = new ParkingSpace({
        owner: user._id,
        address,
        coordinates,
        spotType,
        vehicleSize,
        spacesToRent,
        title,
        description,
        accessInstructions,
        spotImages: spotImages.map(image => image.url),
        pricePerHour,
        pricePerDay,
        pricePerMonth,
        availableFrom,
        daysAvailable,
        reservations: []
    });

    // Save parking space to the database
    await newParkingSpace.save();

    return res.status(201).json(
        new APIResponse(201, newParkingSpace, "Parking space created successfully")
    );
});

const getParkingSpaces = asyncHandler(async (req, res) => {
    const parkingSpaces = await ParkingSpace.find();

    return res.status(200).json(
        new APIResponse(200, parkingSpaces, "Parking spaces retrieved successfully")
    );
});

const uploadSpotImages = asyncHandler(async (req, res) => {
    const spotImages = [];
    for (let file of req.files) {
        const result = await uploadOnCloudinary(file.path);
        spotImages.push(result.secure_url);
    }

    return res.status(200).json(
        new APIResponse(200, spotImages, "Images uploaded successfully")
    );
});

const findNearbyParkingSpaces = asyncHandler(async (req, res) => {
    const { location, timeIn, timeOut } = req.query;

    if (!location) {
        return res.status(400).json({ error: 'Location is required' });
    }

    const [lat, lng] = location.split(',');

    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid location format' });
    }

    // Convert timeIn and timeOut to Date objects
    const timeInDate = new Date(timeIn);
    const timeOutDate = new Date(timeOut);

    if (isNaN(timeInDate) || isNaN(timeOutDate)) {
        return res.status(400).json({ error: 'Invalid date format' });
    }

    // Find parking spaces within the radius
    const parkingSpaces = await ParkingSpace.find({
        coordinates: {
            $geoWithin: {
                $centerSphere: [[lng, lat], 5 / 6378.1], // radius in radians
            },
        },
        availableFrom: { $lte: timeInDate },
        isAvailable: true
    }).lean(); // Use lean to get plain JavaScript objects instead of Mongoose documents

    // Filter parking spaces based on time availability for the specific date
    const filteredParkingSpaces = parkingSpaces.filter(parkingSpace => {
        const { daysAvailable } = parkingSpace;
        const queryDay = timeInDate.toLocaleString('en-US', { weekday: 'long' });

        // Check availability for the specific date and time
        return daysAvailable.some(slot => {
            if (slot.day === queryDay) {
                const fromTime = new Date(`1970-01-01T${slot.fromTime}:00`);
                const toTime = new Date(`1970-01-01T${slot.toTime}:00`);
                const startReservation = new Date(`1970-01-01T${timeInDate.toTimeString().slice(0, 5)}:00`);
                const endReservation = new Date(`1970-01-01T${timeOutDate.toTimeString().slice(0, 5)}:00`);

                return (
                    startReservation >= fromTime && endReservation <= toTime
                );
            }
            return false;
        });
    });

    res.status(200).json(filteredParkingSpaces);
});

const getParkingSpaceById = asyncHandler(async (req, res) => {
    const parkingSpace = await ParkingSpace.findById(req.params.id);

    if (!parkingSpace) {
        throw new APIError(404, "Parking space not found");
    }

    return res.status(200).json(
        new APIResponse(200, parkingSpace, "Parking space retrieved successfully")
    );
});

export { createParkingSpace, getParkingSpaces, uploadSpotImages, findNearbyParkingSpaces, getParkingSpaceById };
